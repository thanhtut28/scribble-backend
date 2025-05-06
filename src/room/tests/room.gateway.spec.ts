import { Test, TestingModule } from '@nestjs/testing';
import { RoomGateway } from '../room.gateway';
import { RoomService } from '../room.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { CreateRoomDto } from '../dto/create-room.dto';
import { JoinRoomDto } from '../dto/join-room.dto';

// Mock Socket
const mockSocket = {
  id: 'socket-123',
  handshake: {
    auth: {
      token: 'mock-jwt-token',
    },
  },
  emit: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
  to: jest.fn().mockReturnThis(),
  disconnect: jest.fn(),
} as unknown as Socket;

// Mock RoomService
const mockRoomService = {
  createRoom: jest.fn(),
  joinRoom: jest.fn(),
  leaveRoom: jest.fn(),
  getRooms: jest.fn(),
  getRoomById: jest.fn(),
  toggleReady: jest.fn(),
};

// Mock JwtService
const mockJwtService = {
  verifyAsync: jest.fn(),
};

// Mock ConfigService
const mockConfigService = {
  get: jest.fn(),
};

// Mock Server
const mockServer = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

describe('RoomGateway', () => {
  let gateway: RoomGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomGateway,
        { provide: RoomService, useValue: mockRoomService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    gateway = module.get<RoomGateway>(RoomGateway);
    // Set the mock server
    gateway.server = mockServer as any;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should authenticate user and store connection info', async () => {
      // Mock JWT verification response
      const mockUser = { sub: 'user-123', email: 'test@example.com' };
      mockJwtService.verifyAsync.mockResolvedValue(mockUser);

      // Call the method
      await gateway.handleConnection(mockSocket);

      // Check if user was added to the connectedUsers map
      expect(gateway['connectedUsers'].has('user-123')).toBeTruthy();
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'connected',
        expect.any(Object),
      );
    });
  });

  describe('createRoom', () => {
    it('should create a room and emit events', async () => {
      // Setup
      const userId = 'user-123';
      const createRoomDto: CreateRoomDto = {
        name: 'Test Room',
        maxPlayers: 6,
        rounds: 3,
      };

      const mockRoom = {
        id: 'room-456',
        name: createRoomDto.name,
        ownerId: userId,
        maxPlayers: createRoomDto.maxPlayers,
        rounds: createRoomDto.rounds,
      };

      // Add user to connectedUsers map
      gateway['connectedUsers'].set(userId, {
        socketId: mockSocket.id,
        userId: userId,
      });

      // Mock service response
      mockRoomService.createRoom.mockResolvedValue(mockRoom);

      // Call the method
      await gateway.createRoom(mockSocket, createRoomDto);

      // Assertions
      expect(mockRoomService.createRoom).toHaveBeenCalledWith(
        userId,
        createRoomDto,
      );
      expect(mockSocket.join).toHaveBeenCalledWith(mockRoom.id);
      expect(mockSocket.emit).toHaveBeenCalledWith('roomCreated', mockRoom);
      expect(mockServer.emit).toHaveBeenCalledWith('roomCreated', mockRoom);

      // Check if roomId was updated in connectedUsers
      const userConnection = gateway['connectedUsers'].get(userId);
      expect(userConnection?.roomId).toBe(mockRoom.id);
    });
  });

  describe('joinRoom', () => {
    it('should join a room and emit events', async () => {
      // Setup
      const userId = 'user-123';
      const joinRoomDto: JoinRoomDto = {
        roomId: 'room-456',
      };

      const mockRoom = {
        id: joinRoomDto.roomId,
        name: 'Test Room',
        ownerId: 'owner-789',
      };

      // Add user to connectedUsers map
      gateway['connectedUsers'].set(userId, {
        socketId: mockSocket.id,
        userId: userId,
      });

      // Mock service response
      mockRoomService.joinRoom.mockResolvedValue(mockRoom);

      // Call the method
      await gateway.joinRoom(mockSocket, joinRoomDto);

      // Assertions
      expect(mockRoomService.joinRoom).toHaveBeenCalledWith(
        userId,
        joinRoomDto,
      );
      expect(mockSocket.join).toHaveBeenCalledWith(mockRoom.id);
      expect(mockSocket.to(mockRoom.id)).toBeTruthy();
      expect(mockServer.to).toHaveBeenCalledWith(mockRoom.id);
      expect(mockServer.to(mockRoom.id).emit).toHaveBeenCalledWith(
        'userJoined',
        expect.any(Object),
      );

      // Check if roomId was updated in connectedUsers
      const userConnection = gateway['connectedUsers'].get(userId);
      expect(userConnection?.roomId).toBe(mockRoom.id);
    });
  });
});
