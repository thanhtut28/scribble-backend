import { UseGuards } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { GameService } from './game.service';
import {
  StartGameDto,
  GuessDto,
  UpdateDrawingDto,
  SendMessageDto,
} from './dto/game.dto';
import { Inject, forwardRef } from '@nestjs/common';

// Socket.io config with explicit settings
const socketConfig = {
  namespace: '/game',
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
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  // Store connected users with their socket ids
  private connectedUsers: Map<
    string,
    { socketId: string; userId: string; gameId?: string }
  > = new Map();

  constructor(
    @Inject(forwardRef(() => GameService)) private gameService: GameService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // Helper method to update all players' game states
  async updateAllPlayerGameStates(gameId: string) {
    const connectedPlayers = Array.from(this.connectedUsers.values()).filter(
      (conn) => conn.gameId === gameId,
    );

    for (const player of connectedPlayers) {
      const personalizedGame = await this.gameService.getGameState(
        gameId,
        player.userId,
      );

      // Find the current round
      const currentRound = personalizedGame.rounds.find(
        (r) => r.roundNumber === personalizedGame.currentRoundNum,
      );

      // Add round time information
      this.server.to(player.socketId).emit('gameStateUpdated', {
        ...personalizedGame,
        roundDuration: this.gameService.getRoundDuration(),
        currentRoundStartedAt: currentRound?.startedAt,
        preserveDrawing: true, // Add flag to prevent client from clearing drawing
      });
    }
  }

  afterInit(server: Server) {
    console.log('Game WebSocket Gateway initialized');
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
      console.log(
        `Client connected to game gateway: ${client.id}, userId: ${userId}`,
      );

      // Acknowledge successful connection
      client.emit('connected', {
        userId,
        message: 'Successfully connected to game service',
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
    // Remove from connected users
    this.connectedUsers.delete(client.id);
    console.log(`Client disconnected: ${client.id}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('startGame')
  async startGame(client: Socket, data: StartGameDto) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (!userConnection) {
        throw new WsException('User not authenticated');
      }

      try {
        const game = await this.gameService.startGame(data.roomId);

        // Join all connected users from the room to the game channel
        this.connectedUsers.forEach((connection) => {
          // Access the socket using the client param or by joining directly
          // This avoids using server.sockets.get which has type issues
          if (connection.socketId === client.id) {
            // If it's the current socket, use it directly
            client.join(`game-${game.id}`);
            connection.gameId = game.id;
          } else {
            // For other sockets, use the room-based approach
            this.server.in(connection.socketId).socketsJoin(`game-${game.id}`);
            connection.gameId = game.id;
          }
        });

        // Send personalized game state to each user
        this.connectedUsers.forEach(async (connection) => {
          const personalizedGame = await this.gameService.getGameState(
            game.id,
            connection.userId,
          );

          this.server
            .to(connection.socketId)
            .emit('gameStarted', personalizedGame);
        });

        // Return personalized response for the requesting client
        const personalizedGame = await this.gameService.getGameState(
          game.id,
          userConnection.userId,
        );

        // Find the current round
        const gameRoundInfo = personalizedGame.rounds.find(
          (r) => r.roundNumber === personalizedGame.currentRoundNum,
        );

        return {
          data: {
            ...personalizedGame,
            roundDuration: this.gameService.getRoundDuration(),
            currentRoundStartedAt: gameRoundInfo?.startedAt,
          },
        };
      } catch (error) {
        // If the error indicates a game is already in progress, handle it specially
        if (error.message && error.message.includes('already in progress')) {
          // Try to get the existing game for this room
          const existingGame = await this.gameService.getCurrentGameInRoom(
            data.roomId,
          );

          if (existingGame) {
            // Join the client to the game channel
            client.join(`game-${existingGame.id}`);

            // Update connection to include game id
            userConnection.gameId = existingGame.id;

            // Return an error with the existing game ID so client can join it
            return {
              error: error.message,
              gameId: existingGame.id,
            };
          }
        }

        // Otherwise, propagate the error normally
        throw error;
      }
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
  @SubscribeMessage('startRound')
  async startRound(client: Socket, gameId: string) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (!userConnection) {
        throw new WsException('User not authenticated');
      }

      const game = await this.gameService.startNextRound(gameId);

      // Notify all clients about the round start with basic round info
      const currentRound = game.rounds.find(
        (r) => r.roundNumber === game.currentRoundNum,
      );
      if (currentRound) {
        this.server.to(`game-${gameId}`).emit('roundStarted', {
          gameId,
          roundNumber: game.currentRoundNum,
          round: {
            ...currentRound,
          },
          roundDuration: this.gameService.getRoundDuration(),
          startedAt: currentRound.startedAt,
        });
      }

      // Send personalized game states to each connected player
      const connectedPlayers = Array.from(this.connectedUsers.values()).filter(
        (conn) => conn.gameId === gameId,
      );

      for (const player of connectedPlayers) {
        const personalizedGame = await this.gameService.getGameState(
          gameId,
          player.userId,
        );

        const roundInfo = personalizedGame.rounds.find(
          (r) => r.roundNumber === personalizedGame.currentRoundNum,
        );

        this.server.to(player.socketId).emit('gameStateUpdated', {
          ...personalizedGame,
          roundDuration: this.gameService.getRoundDuration(),
          currentRoundStartedAt: roundInfo?.startedAt,
          preserveDrawing: true, // Prevent client from clearing drawing data
        });
      }

      // Return personalized response for the requesting client
      const personalizedGame = await this.gameService.getGameState(
        gameId,
        userConnection.userId,
      );

      // Find the current round info
      const roundInfo = personalizedGame.rounds.find(
        (r) => r.roundNumber === personalizedGame.currentRoundNum,
      );

      return {
        data: {
          ...personalizedGame,
          roundDuration: this.gameService.getRoundDuration(),
          currentRoundStartedAt: roundInfo?.startedAt,
        },
      };
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
  @SubscribeMessage('endRound')
  async endRound(client: Socket, gameId: string) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (!userConnection) {
        throw new WsException('User not authenticated');
      }

      const game = await this.gameService.endCurrentRound(gameId);

      // Notify all clients about the round end with basic info
      const completedRoundNumber = game.currentRoundNum - 1;
      const completedRound = game.rounds.find(
        (r) => r.roundNumber === completedRoundNumber,
      );
      const nextRound = game.rounds.find(
        (r) => r.roundNumber === game.currentRoundNum,
      );

      this.server.to(`game-${gameId}`).emit('roundEnded', {
        gameId,
        roundNumber: completedRoundNumber,
        word: completedRound?.word, // Show the word to everyone after round ends
        nextRound: nextRound,
      });

      // If the game ended, notify about that too
      if (game.status === 'FINISHED') {
        this.server.to(`game-${gameId}`).emit('gameEnded', game);
      }

      // Send personalized game states to each connected player
      const connectedPlayers = Array.from(this.connectedUsers.values()).filter(
        (conn) => conn.gameId === gameId,
      );

      for (const player of connectedPlayers) {
        const personalizedGame = await this.gameService.getGameState(
          gameId,
          player.userId,
        );
        this.server.to(player.socketId).emit('gameStateUpdated', {
          ...personalizedGame,
          preserveDrawing: true, // Prevent client from clearing drawing data
        });
      }

      // Return personalized response for the requesting client
      const personalizedGame = await this.gameService.getGameState(
        gameId,
        userConnection.userId,
      );

      // Find the current round info
      const roundInfo = personalizedGame.rounds.find(
        (r) => r.roundNumber === personalizedGame.currentRoundNum,
      );

      return {
        data: {
          ...personalizedGame,
          roundDuration: this.gameService.getRoundDuration(),
          currentRoundStartedAt: roundInfo?.startedAt,
        },
      };
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
  @SubscribeMessage('guess')
  async guess(client: Socket, data: GuessDto) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (!userConnection) {
        throw new WsException('User not authenticated');
      }

      const result = await this.gameService.processGuess(
        data.gameId,
        userConnection.userId,
        data.guess,
      );

      console.log('shit', client.data);

      // Broadcast the message to all players
      this.server.to(`game-${data.gameId}`).emit('message', {
        ...result.message,
        username: client.data?.user?.username || 'Unknown',
      });

      // If the guess was correct, notify all players
      if (result.isCorrect) {
        this.server.to(`game-${data.gameId}`).emit('correctGuess', {
          userId: userConnection.userId,
          username: client.data?.user?.username || 'Unknown',
          word: data.guess,
        });

        // Get the latest game state to check if round ended
        const updatedGame = await this.gameService.getGameState(data.gameId);

        // Send updated scores to all players
        this.server
          .to(`game-${data.gameId}`)
          .emit('scoresUpdated', updatedGame.scores);

        // Check if the round ended due to all correct guesses
        const currentRoundIsFinished = updatedGame.rounds.find(
          (r) =>
            r.roundNumber === updatedGame.currentRoundNum - 1 &&
            r.status === 'FINISHED',
        );

        if (currentRoundIsFinished) {
          // Notify about round ending
          const nextRound = updatedGame.rounds.find(
            (r) => r.roundNumber === updatedGame.currentRoundNum,
          );

          this.server.to(`game-${data.gameId}`).emit('roundEnded', {
            gameId: data.gameId,
            roundNumber: updatedGame.currentRoundNum - 1,
            word: currentRoundIsFinished.word,
            nextRound: nextRound,
          });

          // If the game ended, notify about that too
          if (updatedGame.status === 'FINISHED') {
            this.server
              .to(`game-${data.gameId}`)
              .emit('gameEnded', updatedGame);
          }
        }

        // Update game state for each player (with personalized view)
        const connectedPlayers = Array.from(
          this.connectedUsers.values(),
        ).filter((conn) => conn.gameId === data.gameId);

        for (const player of connectedPlayers) {
          const personalizedGame = await this.gameService.getGameState(
            data.gameId,
            player.userId,
          );
          this.server.to(player.socketId).emit('gameStateUpdated', {
            ...personalizedGame,
            preserveDrawing: true, // Prevent client from clearing drawing data
          });
        }
      }

      return {
        isCorrect: result.isCorrect,
        message: result.message,
      };
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
  @SubscribeMessage('updateDrawing')
  async updateDrawing(client: Socket, data: UpdateDrawingDto) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (!userConnection) {
        throw new WsException('User not authenticated');
      }

      // Save the drawing
      await this.gameService.saveDrawing(
        data.gameId,
        data.roundId,
        userConnection.userId,
        data.paths,
      );

      // Broadcast the drawing update to all players except the drawer
      client.to(`game-${data.gameId}`).emit('drawingUpdated', {
        gameId: data.gameId,
        roundId: data.roundId,
        paths: data.paths,
      });

      return { success: true };
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
  @SubscribeMessage('sendMessage')
  async sendMessage(client: Socket, data: SendMessageDto) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (!userConnection) {
        throw new WsException('User not authenticated');
      }

      // Process the message (this will check if it's a correct guess)
      const result = await this.gameService.processGuess(
        data.gameId,
        userConnection.userId,
        data.content,
      );

      // Broadcast the message to all players
      this.server.to(`game-${data.gameId}`).emit('message', {
        ...result.message,
        username: client.data?.user?.username || 'Unknown',
      });

      // If the guess was correct, notify all players
      if (result.isCorrect) {
        this.server.to(`game-${data.gameId}`).emit('correctGuess', {
          userId: userConnection.userId,
          username: client.data?.user?.username || 'Unknown',
          word: data.content,
        });

        // Get the latest game state to check if round ended
        const updatedGame = await this.gameService.getGameState(data.gameId);

        // Send updated scores to all players
        this.server
          .to(`game-${data.gameId}`)
          .emit('scoresUpdated', updatedGame.scores);

        // Check if the round ended due to all correct guesses
        const currentRoundIsFinished = updatedGame.rounds.find(
          (r) =>
            r.roundNumber === updatedGame.currentRoundNum - 1 &&
            r.status === 'FINISHED',
        );

        if (currentRoundIsFinished) {
          // Notify about round ending
          const nextRound = updatedGame.rounds.find(
            (r) => r.roundNumber === updatedGame.currentRoundNum,
          );

          this.server.to(`game-${data.gameId}`).emit('roundEnded', {
            gameId: data.gameId,
            roundNumber: updatedGame.currentRoundNum - 1,
            word: currentRoundIsFinished.word,
            nextRound: nextRound,
          });

          // If the game ended, notify about that too
          if (updatedGame.status === 'FINISHED') {
            this.server
              .to(`game-${data.gameId}`)
              .emit('gameEnded', updatedGame);
          }
        }

        // Update game state for each player (with personalized view)
        const connectedPlayers = Array.from(
          this.connectedUsers.values(),
        ).filter((conn) => conn.gameId === data.gameId);

        for (const player of connectedPlayers) {
          const personalizedGame = await this.gameService.getGameState(
            data.gameId,
            player.userId,
          );
          this.server.to(player.socketId).emit('gameStateUpdated', {
            ...personalizedGame,
            preserveDrawing: true, // Prevent client from clearing drawing data
          });
        }
      }

      return {
        isCorrect: result.isCorrect,
        message: result.message,
      };
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
  @SubscribeMessage('getGameState')
  async getGameState(client: Socket, gameId: string) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (!userConnection) {
        throw new WsException('User not authenticated');
      }

      const game = await this.gameService.getGameState(
        gameId,
        userConnection.userId,
      );

      // Join the game room if not already joined
      client.join(`game-${gameId}`);

      // Update user connection to include game id
      this.connectedUsers.set(client.id, {
        ...userConnection,
        gameId,
      });

      // Return response properly formatted for the frontend
      return { data: game };
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
  @SubscribeMessage('debugTimers')
  async debugTimers(client: Socket, gameId: string) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (!userConnection) {
        throw new WsException('User not authenticated');
      }

      const timerStatus = await this.gameService.checkTimerStatus(gameId);

      console.log(`Timer status for game ${gameId}:`, timerStatus);

      return {
        success: true,
        data: timerStatus,
      };
    } catch (error) {
      const tokenError = this.handleTokenExpiration(error, client);
      if (tokenError) {
        return tokenError;
      }

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
