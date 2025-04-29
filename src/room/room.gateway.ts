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
      // Invalid token or other error
      console.error('Connection error:', error.message);
      client.emit('error', { message: 'Authentication failed: Invalid token' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userConnection = this.connectedUsers.get(client.id);

    if (userConnection && userConnection.roomId) {
      // Handle user leaving a room when disconnecting
      this.leaveRoom(client, userConnection.roomId).catch((err) => {
        console.error('Error handling disconnect:', err);
      });
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
      client.emit('error', { message: error.message });
      return { error: error.message };
    }
  }
}
