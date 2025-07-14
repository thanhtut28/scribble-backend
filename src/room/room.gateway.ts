import { UseGuards } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomService } from './room.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CreateRoomDto, JoinRoomDto } from './dto';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';

// Socket.io config with explicit settings
const socketConfig = {
  namespace: '/rooms',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
};

// Define the token error interface
interface TokenError {
  code: string;
  message: string;
  redirectTo: string;
}

@WebSocketGateway(socketConfig)
export class RoomGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  // Store connected users with their socket ids and room ids
  private connectedUsers: Map<
    string,
    { socketId: string; userId: string; roomId?: string }
  > = new Map();

  constructor(
    private roomService: RoomService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    console.log('Room WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      // Extract and validate JWT token from handshake
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.split(' ')[1];

      console.log('token', token);

      if (!token) {
        client.emit('error', {
          message: 'Authentication failed: No token provided',
        });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      const userId = payload.sub;

      // Associate user with socket connection
      this.connectedUsers.set(client.id, { socketId: client.id, userId });
      console.log(`Client connected: ${client.id}, userId: ${userId}`);

      // Emit available rooms to the connected client
      const rooms = await this.roomService.getRooms();
      client.emit('rooms', rooms);

      // Acknowledge successful connection
      client.emit('connected', {
        userId,
        message: 'Successfully connected to room service',
      });
    } catch (error) {
      // Check if error is due to JWT token expiration
      if (error.name === 'TokenExpiredError') {
        console.error('Connection error: JWT token expired');
        client.emit('error', {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication failed: Token expired',
          redirectTo: '/auth/login', // Provide redirect URL for the client
        });
      } else {
        // Other token-related errors
        console.error('Connection error:', error.message);
        client.emit('error', {
          code: 'AUTH_FAILED',
          message: 'Authentication failed: Invalid token',
        });
      }
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userConnection = this.connectedUsers.get(client.id);

    if (userConnection && userConnection.roomId) {
      // Instead of immediately removing the user, set a timeout
      // This gives them time to reconnect if they're just refreshing the page
      console.log(
        `Client ${client.id} disconnected, setting reconnect timeout...`,
      );

      // Store the user connection details before removing from the map
      const { userId, roomId } = userConnection;

      // Set a timeout to actually remove them from the room after 10 seconds
      setTimeout(() => {
        // Check if the user has already reconnected
        let reconnected = false;

        // Look through all connected users to see if this user reconnected with a different socket
        for (const [_, connection] of this.connectedUsers.entries()) {
          if (connection.userId === userId) {
            reconnected = true;
            break;
          }
        }

        // Only leave the room if they haven't reconnected
        if (!reconnected) {
          console.log(
            `User ${userId} did not reconnect, removing from room ${roomId}`,
          );
          // We need to create a fake client for the leaveRoom method since the original client is gone
          const fakeClient = {
            emit: () => {},
            leave: () => {},
            disconnect: () => {},
          } as unknown as Socket;

          this.leaveRoom(fakeClient, roomId).catch((err) => {
            console.error('Error handling delayed disconnect:', err);
          });
        } else {
          console.log(`User ${userId} reconnected, keeping in room ${roomId}`);
        }
      }, 10000); // 10 seconds timeout
    }

    // Remove from connected users
    this.connectedUsers.delete(client.id);
    console.log(`Client disconnected: ${client.id}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('createRoom')
  async createRoom(client: Socket, data: CreateRoomDto) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (!userConnection) {
        throw new WsException('User not authenticated');
      }

      const room = await this.roomService.createRoom(
        userConnection.userId,
        data,
      );

      // Update user's room information
      this.connectedUsers.set(client.id, {
        ...userConnection,
        roomId: room.id,
      });

      // Join the socket to the room channel
      client.join(`room-${room.id}`);

      // Notify the creator
      client.emit('roomCreated', room);

      // Broadcast to all clients that a new room is available
      this.server.emit('rooms', await this.roomService.getRooms());

      return room;
    } catch (error) {
      // Check for token expiration first
      const tokenError = this.handleTokenExpiration(error, client);
      if (tokenError) {
        return tokenError;
      }

      // Handle other errors
      client.emit('error', { message: error.message });
      return { error: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('joinRoom')
  async joinRoom(client: Socket, data: JoinRoomDto) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (!userConnection) {
        throw new WsException('User not authenticated');
      }

      // If user is already in a room, leave it first
      if (userConnection.roomId) {
        await this.leaveRoom(client, userConnection.roomId);
      }

      const room = await this.roomService.joinRoom(userConnection.userId, data);

      // Update user's room information
      this.connectedUsers.set(client.id, {
        ...userConnection,
        roomId: room?.id,
      });

      // Join the socket to the room channel
      client.join(`room-${room?.id}`);

      // Notify the room members that someone joined
      this.server.to(`room-${room?.id}`).emit('userJoined', {
        room,
        userId: userConnection.userId,
      });

      // Broadcast updated room list to all clients
      this.server.emit('rooms', await this.roomService.getRooms());

      return room;
    } catch (error) {
      // Check for token expiration first
      const tokenError = this.handleTokenExpiration(error, client);
      if (tokenError) {
        return tokenError;
      }

      // Handle other errors
      client.emit('error', { message: error.message });
      return { error: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leaveRoom')
  async leaveRoom(client: Socket, roomId: string) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (!userConnection) {
        throw new WsException('User not authenticated');
      }

      const result = await this.roomService.leaveRoom(
        userConnection.userId,
        roomId,
      );

      // Update user connection to remove room association
      this.connectedUsers.set(client.id, {
        ...userConnection,
        roomId: undefined,
      });

      // Leave the socket room
      client.leave(`room-${roomId}`);

      // If room still exists, notify remaining members
      if ('id' in result) {
        this.server.to(`room-${roomId}`).emit('userLeft', {
          room: result,
          userId: userConnection.userId,
        });
      }

      // Broadcast updated room list to all clients
      this.server.emit('rooms', await this.roomService.getRooms());

      return result;
    } catch (error) {
      // Check for token expiration first
      const tokenError = this.handleTokenExpiration(error, client);
      if (tokenError) {
        return tokenError;
      }

      // Handle other errors
      client.emit('error', { message: error.message });
      return { error: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('getRooms')
  async getRooms(client: Socket) {
    try {
      const rooms = await this.roomService.getRooms();
      return rooms;
    } catch (error) {
      // Check for token expiration first
      const tokenError = this.handleTokenExpiration(error, client);
      if (tokenError) {
        return tokenError;
      }

      // Handle other errors
      client.emit('error', { message: error.message });
      return { error: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('getRoom')
  async getRoom(client: Socket, roomId: string) {
    try {
      const room = await this.roomService.getRoomById(roomId);
      return room;
    } catch (error) {
      // Check for token expiration first
      const tokenError = this.handleTokenExpiration(error, client);
      if (tokenError) {
        return tokenError;
      }

      // Handle other errors
      client.emit('error', { message: error.message });
      return { error: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('toggleReady')
  async toggleReady(client: Socket, roomId: string) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (!userConnection) {
        throw new WsException('User not authenticated');
      }

      // Ensure user is in the room they're trying to toggle ready for
      if (userConnection.roomId !== roomId) {
        throw new WsException('You are not in this room');
      }

      const room = await this.roomService.toggleReady(
        userConnection.userId,
        roomId,
      );

      // Notify all users in the room about the ready status change
      this.server.to(`room-${roomId}`).emit('playerReadyChanged', {
        room,
        userId: userConnection.userId,
      });

      return room;
    } catch (error) {
      // Check for token expiration first
      const tokenError = this.handleTokenExpiration(error, client);
      if (tokenError) {
        return tokenError;
      }

      // Handle other errors
      client.emit('error', { message: error.message });
      return { error: error.message };
    }
  }

  /**
   * Helper method to handle token expiration errors
   * @param error The caught error
   * @param client The socket client
   * @returns Object with error and redirect info if token expired, null otherwise
   */
  private handleTokenExpiration(
    error: any,
    client: Socket,
  ): { error: string; redirectTo: string } | null {
    if (error instanceof WsException) {
      const wsError = error.getError();

      // Check if it's our custom token expired error object
      if (
        typeof wsError === 'object' &&
        wsError !== null &&
        'code' in wsError &&
        wsError.code === 'TOKEN_EXPIRED'
      ) {
        const errorDetails = wsError as TokenError;

        // Send specific token expiration error
        client.emit('error', errorDetails);

        // Disconnect the client
        client.disconnect();

        return { error: 'Token expired', redirectTo: errorDetails.redirectTo };
      }
    }

    return null;
  }
}
