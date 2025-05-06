import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VocabularyService } from './vocabulary.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { GameGateway } from './game.gateway';

@Injectable()
export class GameService {
  // Points awarded for correct guesses
  private readonly POINTS_FOR_CORRECT_GUESS = 100;
  // Additional points for drawer per correct guess
  private readonly DRAWER_POINTS_PER_GUESS = 25;
  // Round duration in milliseconds (60 seconds)
  private readonly ROUND_DURATION = 60 * 1000;

  // Store active round timers
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private prisma: PrismaService,
    private vocabularyService: VocabularyService,
    private schedulerRegistry: SchedulerRegistry,
    @Inject(forwardRef(() => GameGateway)) private gameGateway: GameGateway,
  ) {}

  /**
   * Schedule the automatic end of a round after ROUND_DURATION
   * @param gameId The ID of the game
   * @param roundId The ID of the round
   */
  private scheduleRoundEnd(gameId: string, roundId: string): void {
    // Clear any existing timer for this game
    this.clearRoundTimer(gameId);

    console.log(`Scheduling round end for game ${gameId}, round ${roundId}`);

    // Create a new timer
    const timeout = setTimeout(async () => {
      try {
        console.log(`Round timer expired for game ${gameId}, round ${roundId}`);

        // End the round when timer expires
        const game = await this.endCurrentRound(gameId);

        if (game) {
          // Notify clients that the round has ended due to timer
          const completedRoundNumber = game.currentRoundNum - 1;
          const completedRound = game.rounds.find(
            (r) => r.roundNumber === completedRoundNumber,
          );
          const nextRound = game.rounds.find(
            (r) => r.roundNumber === game.currentRoundNum,
          );

          // Emit roundEnded event with the timeout info
          this.gameGateway.server.to(`game-${gameId}`).emit('roundEnded', {
            gameId,
            roundNumber: completedRoundNumber,
            word: completedRound?.word,
            nextRound: nextRound ? nextRound : null,
            timedOut: true, // Flag indicating the round ended due to timer
          });

          // If the game ended, notify about that too
          if (game.status === 'FINISHED') {
            this.gameGateway.server
              .to(`game-${gameId}`)
              .emit('gameEnded', game);
          }

          // Update game state for all players
          this.gameGateway.updateAllPlayerGameStates(gameId);
        }
      } catch (error) {
        console.error('Error ending round by timer:', error);
      }
    }, this.ROUND_DURATION);

    // Also emit timer updates at regular intervals
    this.emitTimerUpdates(gameId, roundId);

    // Store the timer reference
    this.activeTimers.set(gameId, timeout);

    console.log(
      `Round timer started for game ${gameId} - will end in ${this.ROUND_DURATION / 1000} seconds`,
    );
  }

  /**
   * Emit timer updates to clients
   * @param gameId The ID of the game
   * @param roundId The ID of the round
   */
  private emitTimerUpdates(gameId: string, roundId: string): void {
    console.log(
      `Setting up timer updates for game ${gameId}, round ${roundId}`,
    );

    // Clear any existing interval for this game before creating a new one
    try {
      this.schedulerRegistry.deleteInterval(`timer-${gameId}`);
      console.log(`Cleared existing timer interval for game ${gameId}`);
    } catch (e) {
      // Interval might not exist, which is fine
    }

    // Get the round start time
    this.prisma.round
      .findUnique({
        where: { id: roundId },
        include: {
          game: true, // Include game to check if it's still active
        },
      })
      .then((round) => {
        if (!round) {
          console.error(
            `Round ${roundId} not found when setting up timer updates`,
          );
          return;
        }

        if (!round.startedAt) {
          console.error(`Round ${roundId} has no startedAt timestamp`);
          return;
        }

        const startTime = round.startedAt;
        const endTime = new Date(startTime.getTime() + this.ROUND_DURATION);
        console.log(
          `Timer will run from ${startTime.toISOString()} to ${endTime.toISOString()}`,
        );

        // Emit time remaining every second
        const interval = setInterval(async () => {
          try {
            // Check if the round and game are still active before sending updates
            const currentRound = await this.prisma.round.findUnique({
              where: { id: roundId },
              include: {
                game: true,
              },
            });

            // Stop if round/game no longer exists or game is finished
            if (
              !currentRound ||
              !currentRound.game ||
              currentRound.game.status === 'FINISHED' ||
              currentRound.status === 'FINISHED'
            ) {
              console.log(
                `Round ${roundId} is no longer active (status: ${currentRound?.status}), stopping timer updates`,
              );
              clearInterval(interval);
              try {
                this.schedulerRegistry.deleteInterval(`timer-${gameId}`);
              } catch (e) {
                // Interval might already be deleted
              }
              return;
            }

            const now = new Date();
            const remainingTime = endTime.getTime() - now.getTime();

            if (remainingTime <= 0) {
              console.log(`Timer expired for game ${gameId}, round ${roundId}`);
              clearInterval(interval);
              try {
                this.schedulerRegistry.deleteInterval(`timer-${gameId}`);
              } catch (e) {
                // Interval might not exist, which is fine
              }
              return;
            }

            // Emit time update to all clients in the game
            this.gameGateway.server.to(`game-${gameId}`).emit('timerUpdate', {
              gameId,
              roundId,
              remainingTime,
              totalTime: this.ROUND_DURATION,
            });
          } catch (error) {
            console.error('Error during timer update:', error);
          }
        }, 1000); // Update every 1 second

        // Store the interval reference for cleanup
        this.schedulerRegistry.addInterval(`timer-${gameId}`, interval);
        console.log(
          `Timer updates started for game ${gameId}, round ${roundId}`,
        );
      })
      .catch((error) => {
        console.error('Error setting up timer updates:', error);
      });
  }

  /**
   * Clear the timer for a game
   * @param gameId The ID of the game
   */
  private clearRoundTimer(gameId: string): void {
    const existingTimer = this.activeTimers.get(gameId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.activeTimers.delete(gameId);
      console.log(`Cleared existing timer for game ${gameId}`);
    }

    // Also clear any timer update intervals
    try {
      this.schedulerRegistry.deleteInterval(`timer-${gameId}`);
      console.log(`Cleared timer updates for game ${gameId}`);
    } catch (e) {
      // Interval might not exist, which is fine
    }
  }

  /**
   * Get the round duration in milliseconds
   * @returns The round duration in milliseconds
   */
  getRoundDuration(): number {
    return this.ROUND_DURATION;
  }

  /**
   * Start a new game in the specified room
   * @param roomId The ID of the room where the game will be played
   * @returns The created game
   */
  async startGame(roomId: string) {
    // Check if the room exists
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        users: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if there are enough players (at least 2)
    if (room.users.length < 2) {
      throw new BadRequestException('Need at least 2 players to start a game');
    }

    // Check if all users are ready
    const notReadyUsers = room.users.filter((userRoom) => !userRoom.isReady);
    if (notReadyUsers.length > 0) {
      throw new BadRequestException(
        'All players must be ready to start the game',
      );
    }

    // Check if a game is already in progress
    const activeGame = await this.prisma.$queryRaw`
      SELECT * FROM "Game" 
      WHERE "roomId" = ${roomId} 
      AND "status" IN ('WAITING', 'PLAYING')
    `;

    if (Array.isArray(activeGame) && activeGame.length > 0) {
      throw new BadRequestException(
        'A game is already in progress in this room',
      );
    }

    // Update room status
    await this.prisma.room.update({
      where: { id: roomId },
      data: {
        status: 'PLAYING',
      },
    });

    // Create a new game
    const game = await this.prisma.$transaction(async (tx) => {
      // Create game
      const newGame = await tx.game.create({
        data: {
          roomId,
          status: 'WAITING',
          currentRoundNum: 1,
        },
      });

      // Create rounds for the game
      const totalRounds = room.rounds;
      const userCount = room.users.length;

      // Generate words for each round
      const words = this.vocabularyService.getRandomWords(totalRounds);

      // Create a shuffled array of player indices to ensure random and fair drawer selection
      const playerIndices = room.users.map((_, index) => index);
      for (let i = playerIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [playerIndices[i], playerIndices[j]] = [
          playerIndices[j],
          playerIndices[i],
        ]; // Swap elements
      }

      // Create each round with a fairly distributed drawer assignment
      for (let i = 0; i < totalRounds; i++) {
        // Determine drawer index using the shuffled array
        // If we need more rounds than players, cycle through the shuffled array
        const drawerIndex = playerIndices[i % userCount];
        const drawer = room.users[drawerIndex];

        await tx.round.create({
          data: {
            gameId: newGame.id,
            roundNumber: i + 1,
            word: words[i],
            drawerId: drawer.userId,
            status: i === 0 ? 'WAITING' : 'WAITING',
          },
        });
      }

      // Initialize game scores for all players
      const scorePromises = room.users.map((userRoom) =>
        tx.gameScore.create({
          data: {
            gameId: newGame.id,
            userId: userRoom.userId,
            score: 0,
            correct: 0,
          },
        }),
      );
      await Promise.all(scorePromises);

      return newGame;
    });

    // Return game with rounds
    const gameState = await this.getGameState(game.id);

    // Auto-start the first round
    await this.startNextRound(game.id);

    // Return the updated game state
    return this.getGameState(game.id);
  }

  /**
   * Start the next round in a game
   * @param gameId The ID of the game
   * @returns The updated game state
   */
  async startNextRound(gameId: string) {
    console.log(`Starting next round for game ${gameId}`);

    // Clear any existing timer first
    this.clearRoundTimer(gameId);

    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        rounds: {
          orderBy: {
            roundNumber: 'asc',
          },
        },
      },
    });

    if (!game) {
      throw new NotFoundException('Game not found');
    }

    if (game.status === 'FINISHED') {
      throw new BadRequestException('The game is already finished');
    }

    // Find the current or next round to start
    let currentRound;

    if (game.currentRoundNum <= game.rounds.length) {
      currentRound = game.rounds.find(
        (r) => r.roundNumber === game.currentRoundNum,
      );
    } else {
      // All rounds complete, end the game
      return this.endGame(gameId);
    }

    if (!currentRound) {
      throw new NotFoundException('Round not found');
    }

    // Check if the current round is already in progress or finished
    if (
      currentRound.status === 'DRAWING' ||
      currentRound.status === 'GUESSING'
    ) {
      throw new BadRequestException('The current round is already in progress');
    }

    if (currentRound.status === 'FINISHED') {
      // Move to the next round
      const nextRoundNum = game.currentRoundNum + 1;

      if (nextRoundNum > game.rounds.length) {
        // All rounds complete, end the game
        return this.endGame(gameId);
      }

      // Update the game to point to the next round
      await this.prisma.game.update({
        where: { id: gameId },
        data: {
          currentRoundNum: nextRoundNum,
          status: 'PLAYING',
        },
      });

      // Recursively start the next round
      return this.startNextRound(gameId);
    }

    console.log(`Setting round ${currentRound.id} to DRAWING status`);

    // Start the current round
    const updatedRound = await this.prisma.round.update({
      where: { id: currentRound.id },
      data: {
        status: 'DRAWING',
        startedAt: new Date(),
      },
    });

    // Update game status if this is the first round
    if (game.status === 'WAITING') {
      await this.prisma.game.update({
        where: { id: gameId },
        data: {
          status: 'PLAYING',
        },
      });
    }

    console.log(`Starting timer for round ${updatedRound.id}, game ${gameId}`);

    // Start the round timer with the updated round info
    this.scheduleRoundEnd(gameId, updatedRound.id);

    console.log(`Started round ${currentRound.roundNumber} for game ${gameId}`);

    // Return updated game state
    return this.getGameState(gameId);
  }

  /**
   * End the current round
   * @param gameId The ID of the game
   * @returns The updated game state
   */
  async endCurrentRound(gameId: string) {
    console.log(`Ending current round for game ${gameId}`);

    // Clear any existing timer for this game
    this.clearRoundTimer(gameId);

    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        rounds: {
          orderBy: {
            roundNumber: 'asc',
          },
        },
      },
    });

    if (!game) {
      throw new NotFoundException('Game not found');
    }

    if (game.status !== 'PLAYING') {
      throw new BadRequestException('The game is not in progress');
    }

    // Find the current round
    const currentRound = game.rounds.find(
      (r) => r.roundNumber === game.currentRoundNum,
    );

    if (!currentRound) {
      throw new NotFoundException('Current round not found');
    }

    // Only end the round if it's in progress
    if (
      currentRound.status !== 'DRAWING' &&
      currentRound.status !== 'GUESSING'
    ) {
      throw new BadRequestException('The current round is not in progress');
    }

    console.log(`Updating round ${currentRound.id} status to FINISHED`);

    // End the current round
    await this.prisma.round.update({
      where: { id: currentRound.id },
      data: {
        status: 'FINISHED',
        endedAt: new Date(),
      },
    });

    // If this was the last round, end the game
    if (game.currentRoundNum === game.rounds.length) {
      return this.endGame(gameId);
    }

    // Otherwise, increment the round number
    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        currentRoundNum: game.currentRoundNum + 1,
      },
    });

    // Get the updated game state with the new round
    const updatedGame = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        rounds: {
          orderBy: {
            roundNumber: 'asc',
          },
        },
      },
    });

    // If we have a next round, prepare it for starting
    if (
      updatedGame &&
      updatedGame.currentRoundNum <= updatedGame.rounds.length
    ) {
      const nextRound = updatedGame.rounds.find(
        (r) => r.roundNumber === updatedGame.currentRoundNum,
      );

      if (nextRound && nextRound.status === 'WAITING') {
        console.log(`Starting next round ${nextRound.id} for game ${gameId}`);

        // Update the next round status to DRAWING and set startedAt
        const updatedNextRound = await this.prisma.round.update({
          where: { id: nextRound.id },
          data: {
            status: 'DRAWING',
            startedAt: new Date(), // Make sure to set the start time
          },
        });

        // Start timer for the next round using the updated round with new startedAt
        this.scheduleRoundEnd(gameId, updatedNextRound.id);
        console.log(`Timer scheduled for next round ${updatedNextRound.id}`);
      }
    }

    // Return updated game state
    return this.getGameState(gameId);
  }

  /**
   * End a game
   * @param gameId The ID of the game to end
   * @returns The final game state
   */
  async endGame(gameId: string) {
    // Clear any existing timer for this game
    this.clearRoundTimer(gameId);

    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        room: true,
      },
    });

    if (!game) {
      throw new NotFoundException('Game not found');
    }

    if (game.status === 'FINISHED') {
      throw new BadRequestException('The game is already finished');
    }

    // Update game status
    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'FINISHED',
        endedAt: new Date(),
      },
    });

    // Update room status
    await this.prisma.room.update({
      where: { id: game.roomId },
      data: {
        status: 'WAITING',
      },
    });

    // Update player stats based on game results
    const scores = await this.prisma.gameScore.findMany({
      where: { gameId },
      orderBy: { score: 'desc' },
    });

    // Find the winner(s) - there could be a tie
    const highestScore = scores.length > 0 ? scores[0].score : 0;
    const winners = scores.filter((score) => score.score === highestScore);

    // Update stats for all players in the game
    for (const score of scores) {
      await this.prisma.user.update({
        where: { id: score.userId },
        data: {
          gamesPlayed: { increment: 1 },
          totalScore: { increment: score.score },
          // Increment gamesWon only for winners
          gamesWon: winners.some((winner) => winner.userId === score.userId)
            ? { increment: 1 }
            : undefined,
        },
      });
    }

    // Return final game state
    return this.getGameState(gameId);
  }

  /**
   * Process a player's guess
   * @param gameId The ID of the game
   * @param userId The ID of the user making the guess
   * @param guess The guess text
   * @returns Result of the guess
   */
  async processGuess(gameId: string, userId: string, guess: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        rounds: {
          orderBy: {
            roundNumber: 'asc',
          },
        },
      },
    });

    if (!game) {
      throw new NotFoundException('Game not found');
    }

    if (game.status !== 'PLAYING') {
      throw new BadRequestException('The game is not in progress');
    }

    // Find the current round
    let currentRound = game.rounds.find(
      (r) => r.roundNumber === game.currentRoundNum,
    );

    if (!currentRound) {
      throw new NotFoundException('Current round not found');
    }

    // Only process guesses if the round is in progress
    if (
      currentRound.status !== 'DRAWING' &&
      currentRound.status !== 'GUESSING'
    ) {
      throw new BadRequestException(
        'The current round is not in guessing phase',
      );
    }

    // Check if the user is the drawer (can't guess their own word)
    if (currentRound.drawerId === userId) {
      throw new BadRequestException('The drawer cannot guess their own word');
    }

    // Check if the player has already guessed correctly in this round
    const existingCorrectGuess = await this.prisma.message.findFirst({
      where: {
        gameId,
        userId,
        isCorrect: true,
        createdAt: {
          gte: currentRound.startedAt,
          ...(currentRound.endedAt && { lte: currentRound.endedAt }),
        },
      },
    });

    if (existingCorrectGuess) {
      throw new BadRequestException(
        'You have already guessed correctly in this round',
      );
    }

    // Check if the guess is correct
    const isCorrect = this.vocabularyService.isCorrectGuess(
      guess,
      currentRound.word,
    );

    // Create message record
    const message = await this.prisma.message.create({
      data: {
        gameId,
        userId,
        content: guess,
        isCorrect,
      },
    });

    // If the guess is correct, update scores
    if (isCorrect) {
      // Update the guesser's score
      await this.prisma.gameScore.updateMany({
        where: {
          gameId,
          userId,
        },
        data: {
          score: { increment: this.POINTS_FOR_CORRECT_GUESS },
          correct: { increment: 1 },
        },
      });

      // Update drawer's score if the drawer exists
      if (currentRound.drawerId) {
        await this.prisma.gameScore.updateMany({
          where: {
            gameId,
            userId: currentRound.drawerId,
          },
          data: {
            score: { increment: this.DRAWER_POINTS_PER_GUESS },
          },
        });
      }

      // Update round status to guessing if it was drawing
      if (currentRound.status === 'DRAWING') {
        await this.prisma.round.update({
          where: { id: currentRound.id },
          data: {
            status: 'GUESSING',
          },
        });

        // Refresh current round data after status update
        const updatedRound = await this.prisma.round.findUnique({
          where: { id: currentRound.id },
        });

        if (updatedRound) {
          currentRound = updatedRound;
        }
      }

      // Check if all players have guessed correctly
      const allPlayersCount = await this.prisma.userRoom.count({
        where: {
          roomId: game.roomId,
        },
      });

      // Count unique users who have correctly guessed in this round
      const correctGuessesCount = await this.prisma.message
        .findMany({
          where: {
            gameId,
            isCorrect: true,
            createdAt: {
              gte: currentRound.startedAt,
              ...(currentRound.endedAt && { lte: currentRound.endedAt }),
            },
          },
          distinct: ['userId'],
        })
        .then((messages) => messages.length);

      // If everyone except the drawer has guessed correctly, end the round
      if (correctGuessesCount >= allPlayersCount - 1) {
        return this.endCurrentRound(gameId).then(() => ({
          message,
          isCorrect,
        }));
      }
    }

    return {
      message,
      isCorrect,
    };
  }

  /**
   * Save a drawing update
   * @param gameId The ID of the game
   * @param roundId The ID of the round
   * @param userId The ID of the user (drawer)
   * @param paths The drawing paths data
   * @returns The saved drawing
   */
  async saveDrawing(
    gameId: string,
    roundId: string,
    userId: string,
    paths: any,
  ) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        rounds: {
          where: {
            id: roundId,
          },
        },
      },
    });

    if (!game) {
      throw new NotFoundException('Game not found');
    }

    if (game.status !== 'PLAYING') {
      throw new BadRequestException('The game is not in progress');
    }

    if (game.rounds.length === 0) {
      throw new NotFoundException('Round not found');
    }

    const round = game.rounds[0];

    // Check if the user is the drawer for this round
    if (round.drawerId !== userId) {
      throw new BadRequestException('Only the drawer can update the drawing');
    }

    // Only allow drawing if the round is in progress
    if (round.status !== 'DRAWING' && round.status !== 'GUESSING') {
      throw new BadRequestException('The round is not in drawing phase');
    }

    // Save the drawing
    const drawing = await this.prisma.drawing.create({
      data: {
        roundId,
        userId,
        paths,
      },
    });

    return drawing;
  }

  /**
   * Get the current state of a game
   * @param gameId The ID of the game
   * @param userId Optional user ID to customize the response for the drawer
   * @returns The game state with all related data
   */
  async getGameState(gameId: string, userId?: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        rounds: {
          orderBy: {
            roundNumber: 'asc',
          },
          include: {
            drawings: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 1, // Only get the latest drawing for each round
            },
          },
        },
        scores: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
          orderBy: {
            score: 'desc',
          },
        },
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!game) {
      throw new NotFoundException('Game not found');
    }

    // Simply return the game with all words visible to everyone
    return game;
  }

  /**
   * Get the current game in a room
   * @param roomId The ID of the room
   * @param userId Optional user ID to customize the response for the drawer
   * @returns The current game in the room, or null if none exists
   */
  async getCurrentGameInRoom(roomId: string, userId?: string) {
    const game = await this.prisma.game.findFirst({
      where: {
        roomId,
        status: {
          in: ['WAITING', 'PLAYING'],
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (!game) {
      return null;
    }

    return this.getGameState(game.id, userId);
  }

  /**
   * Debug method to check timer status
   * @param gameId The ID of the game
   * @returns Information about the timers for this game
   */
  async checkTimerStatus(gameId: string) {
    const hasActiveTimer = this.activeTimers.has(gameId);
    const activeTimerValue = this.activeTimers.get(gameId);

    let hasTimerInterval = false;
    try {
      const intervals = this.schedulerRegistry.getIntervals();
      hasTimerInterval = intervals.includes(`timer-${gameId}`);
    } catch (e) {
      console.error('Error checking interval:', e);
    }

    // Get current game round info
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        rounds: {
          orderBy: {
            roundNumber: 'asc',
          },
        },
      },
    });

    let currentRoundStatus: string | undefined = undefined;
    let currentRoundStartedAt: Date | undefined = undefined;

    if (game) {
      const currentRound = game.rounds.find(
        (r) => r.roundNumber === game.currentRoundNum,
      );
      if (currentRound) {
        currentRoundStatus = currentRound.status;
        currentRoundStartedAt = currentRound.startedAt;
      }
    }

    return {
      hasActiveTimer,
      hasTimerInterval,
      gameStatus: game?.status,
      currentRoundNum: game?.currentRoundNum,
      currentRoundStatus,
      currentRoundStartedAt,
    };
  }
}
