import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { GetUser } from '../auth/decorators';
import { JwtGuard } from '../auth/guards';

interface UpdateStatsDto {
  won: boolean;
  score: number;
}

@UseGuards(JwtGuard)
@Controller('user-stats')
export class UserStatsController {
  constructor(private userService: UserService) {}

  @Get(':userId')
  async getUserStats(@Param('userId') userId: string) {
    const user = await this.userService.getUser(userId);
    return {
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      totalScore: user.totalScore,
      winRate:
        user.gamesPlayed > 0 ? (user.gamesWon / user.gamesPlayed) * 100 : 0,
      averageScore:
        user.gamesPlayed > 0 ? user.totalScore / user.gamesPlayed : 0,
    };
  }

  @Post()
  updateStats(@GetUser('id') userId: string, @Body() dto: UpdateStatsDto) {
    return this.userService.updateStats(userId, dto.won, dto.score);
  }
}
