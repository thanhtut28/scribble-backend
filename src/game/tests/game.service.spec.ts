import { Test, TestingModule } from '@nestjs/testing';
import { GameService } from '../game.service';
import { PrismaService } from '../../prisma/prisma.service';
import { VocabularyService } from '../../vocabulary/vocabulary.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { GameGateway } from '../game.gateway';
import { forwardRef } from '@nestjs/common';

// Mock dependencies
const mockPrismaService = {
  game: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  round: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  room: {
    findUnique: jest.fn(),
  },
  userRoom: {
    findMany: jest.fn(),
  },
};

const mockVocabularyService = {
  getRandomWords: jest.fn(),
};

const mockSchedulerRegistry = {
  addTimeout: jest.fn(),
  deleteTimeout: jest.fn(),
  getTimeouts: jest.fn().mockReturnValue([]),
};

const mockGameGateway = {
  updateAllPlayerGameStates: jest.fn(),
};

describe('GameService', () => {
  let service: GameService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: VocabularyService, useValue: mockVocabularyService },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
        { provide: forwardRef(() => GameGateway), useValue: mockGameGateway },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRoundDuration', () => {
    it('should return the round duration', () => {
      const duration = service.getRoundDuration();
      expect(duration).toBe(60 * 1000); // 60 seconds in milliseconds
    });
  });

  describe('processGuess', () => {
    it('should process a correct guess and calculate points', async () => {
      // Mock data
      const gameId = 'game-123';
      const userId = 'user-456';
      const correctWord = 'apple';

      // Mock a game round with the drawer and word
      const mockGame = {
        id: gameId,
        currentRoundId: 'round-789',
        status: 'PLAYING',
      };

      const mockRound = {
        id: 'round-789',
        word: correctWord,
        drawerId: 'drawer-123',
        status: 'PLAYING',
        startTime: new Date(Date.now() - 10000), // Started 10 seconds ago
        guesses: [],
      };

      // Setup mocks
      mockPrismaService.game.findUnique.mockResolvedValue(mockGame);
      mockPrismaService.round.findUnique.mockResolvedValue(mockRound);
      mockPrismaService.round.update.mockResolvedValue({
        ...mockRound,
        guesses: [{ userId, word: correctWord, time: expect.any(Date) }],
      });

      // Call the method
      const result = await service.processGuess(gameId, userId, correctWord);

      // Assertions
      expect(result.correct).toBe(true);
      expect(result.points).toBeGreaterThan(0);
      expect(mockPrismaService.round.update).toHaveBeenCalled();
      expect(mockGameGateway.updateAllPlayerGameStates).toHaveBeenCalledWith(
        gameId,
      );
    });

    it('should process an incorrect guess', async () => {
      // Mock data
      const gameId = 'game-123';
      const userId = 'user-456';
      const correctWord = 'apple';
      const incorrectGuess = 'banana';

      // Mock a game round
      const mockGame = {
        id: gameId,
        currentRoundId: 'round-789',
        status: 'PLAYING',
      };

      const mockRound = {
        id: 'round-789',
        word: correctWord,
        drawerId: 'drawer-123',
        status: 'PLAYING',
        startTime: new Date(),
        guesses: [],
      };

      // Setup mocks
      mockPrismaService.game.findUnique.mockResolvedValue(mockGame);
      mockPrismaService.round.findUnique.mockResolvedValue(mockRound);

      // Call the method
      const result = await service.processGuess(gameId, userId, incorrectGuess);

      // Assertions
      expect(result.correct).toBe(false);
      expect(result.points).toBe(0);
      expect(mockPrismaService.round.update).not.toHaveBeenCalled();
    });
  });
});
