import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto, UserResponseDto } from './dto/user.dto';
import * as argon from 'argon2';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getUser(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, refreshToken, ...userResponse } = user;
    return userResponse;
  }

  async getUserByUsername(username: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, refreshToken, ...userResponse } = user;
    return userResponse;
  }

  async updateUser(
    userId: string,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    // Check if email or username exists
    if (dto.email || dto.username) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            dto.email ? { email: dto.email } : {},
            dto.username ? { username: dto.username } : {},
          ],
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        throw new ForbiddenException('Email or username already taken');
      }
    }

    const userData: any = {};

    if (dto.email) userData.email = dto.email;
    if (dto.username) userData.username = dto.username;
    if (dto.password) userData.password = await argon.hash(dto.password);

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: userData,
    });

    const { password, refreshToken, ...userResponse } = updatedUser;
    return userResponse;
  }

  async getLeaderboard(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      orderBy: {
        totalScore: 'desc',
      },
      take: 10,
    });

    return users.map((user) => {
      const { password, refreshToken, ...userResponse } = user;
      return userResponse;
    });
  }

  async updateStats(
    userId: string,
    won: boolean,
    score: number,
  ): Promise<UserResponseDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        gamesPlayed: { increment: 1 },
        gamesWon: won ? { increment: 1 } : undefined,
        totalScore: { increment: score },
      },
    });

    const { password, refreshToken, ...userResponse } = user;
    return userResponse;
  }
}
