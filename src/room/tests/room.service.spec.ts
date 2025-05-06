import { Test, TestingModule } from '@nestjs/testing';
import { RoomService } from '../room.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoomDto } from '../dto/create-room.dto';
import { JoinRoomDto } from '../dto/join-room.dto';
import { BadRequestException } from '@nestjs/common';

// Mock PrismaService
const mockPrismaService = {
  room: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  userRoom: {
    create: jest.fn(),
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('RoomService', () => {
  let service: RoomService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<RoomService>(RoomService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRoom', () => {
    it('should create a room successfully', async () => {
      // Mock data
      const userId = 'user-123';
      const createRoomDto: CreateRoomDto = {
        name: 'Test Room',
        maxPlayers: 6,
        rounds: 3,
        isPrivate: false,
      };

      // Mock responses
      const mockRoom = {
        id: 'room-456',
        name: createRoomDto.name,
        ownerId: userId,
        maxPlayers: createRoomDto.maxPlayers,
        rounds: createRoomDto.rounds,
        isPrivate: createRoomDto.isPrivate,
        status: 'WAITING',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUserRoom = {
        userId,
        roomId: mockRoom.id,
        isReady: false,
        joinedAt: new Date(),
      };

      // Mock the transaction response
      mockPrismaService.$transaction.mockResolvedValue([
        mockRoom,
        mockUserRoom,
      ]);

      // Call the method
      const result = await service.createRoom(userId, createRoomDto);

      // Assertions
      expect(result).toEqual(mockRoom);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('joinRoom', () => {
    it('should allow a user to join a public room', async () => {
      // Mock data
      const userId = 'user-123';
      const joinRoomDto: JoinRoomDto = {
        roomId: 'room-456',
      };

      // Mock responses
      const mockRoom = {
        id: joinRoomDto.roomId,
        name: 'Test Room',
        ownerId: 'owner-789',
        maxPlayers: 6,
        rounds: 3,
        isPrivate: false,
        status: 'WAITING',
      };

      const mockUserRooms = [
        { userId: 'owner-789', roomId: mockRoom.id },
        // Simulate 3 players already in the room
        { userId: 'player-1', roomId: mockRoom.id },
        { userId: 'player-2', roomId: mockRoom.id },
      ];

      mockPrismaService.room.findUnique.mockResolvedValue(mockRoom);
      mockPrismaService.userRoom.findFirst.mockResolvedValue(null); // User not already in room
      mockPrismaService.userRoom.findMany.mockResolvedValue(mockUserRooms);
      mockPrismaService.userRoom.create.mockResolvedValue({
        userId,
        roomId: mockRoom.id,
        isReady: false,
        joinedAt: new Date(),
      });

      // Call the method
      const result = await service.joinRoom(userId, joinRoomDto);

      // Assertions
      expect(result).toHaveProperty('id', mockRoom.id);
      expect(mockPrismaService.userRoom.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          roomId: mockRoom.id,
        }),
      });
    });

    it('should not allow joining a full room', async () => {
      // Mock data
      const userId = 'user-123';
      const joinRoomDto: JoinRoomDto = {
        roomId: 'room-456',
      };

      // Mock a room with max players = 4
      const mockRoom = {
        id: joinRoomDto.roomId,
        name: 'Test Room',
        ownerId: 'owner-789',
        maxPlayers: 4,
        rounds: 3,
        isPrivate: false,
        status: 'WAITING',
      };

      // Mock that the room already has 4 players (max capacity)
      const mockUserRooms = Array(4)
        .fill(null)
        .map((_, idx) => ({
          userId: `existing-player-${idx}`,
          roomId: mockRoom.id,
        }));

      mockPrismaService.room.findUnique.mockResolvedValue(mockRoom);
      mockPrismaService.userRoom.findFirst.mockResolvedValue(null); // User not already in room
      mockPrismaService.userRoom.findMany.mockResolvedValue(mockUserRooms);

      // Expect the method to throw an error
      await expect(service.joinRoom(userId, joinRoomDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.userRoom.create).not.toHaveBeenCalled();
    });
  });
});
