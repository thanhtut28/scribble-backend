import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { SigninDto, SignupDto, TokenDto } from './dto/auth.dto';
import * as argon from 'argon2';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    // Check if user already exists
    const userExists = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
      },
    });

    if (userExists) {
      throw new ForbiddenException('User already exists');
    }

    // Hash password
    const hashedPassword = await argon.hash(dto.password);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        password: hashedPassword,
      },
    });

    // Generate tokens
    const tokens = await this.getTokens(user.id, user.email);

    // Update refresh token
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async signin(dto: SigninDto) {
    // Find user
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.usernameOrEmail }, { username: dto.usernameOrEmail }],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const passwordMatches = await argon.verify(user.password, dto.password);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate tokens
    const tokens = await this.getTokens(user.id, user.email);

    // Update refresh token
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async refreshTokens(dto: TokenDto) {
    try {
      // Verify refresh token
      const decoded = await this.jwtService.verifyAsync<JwtPayload>(
        dto.refreshToken,
        {
          secret: process.env.JWT_REFRESH_SECRET,
        },
      );

      // Find user
      const user = await this.prisma.user.findUnique({
        where: {
          id: decoded.sub,
        },
      });

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Access denied');
      }

      // Verify the stored refresh token
      const refreshTokenMatches = await argon.verify(
        user.refreshToken,
        dto.refreshToken,
      );

      if (!refreshTokenMatches) {
        throw new UnauthorizedException('Access denied');
      }

      // Generate new tokens
      const tokens = await this.getTokens(user.id, user.email);

      // Update refresh token
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      return tokens;
    } catch {
      throw new UnauthorizedException('Access denied');
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        refreshToken: null,
      },
    });

    return { message: 'Logged out successfully' };
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedRefreshToken = await argon.hash(refreshToken);
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        refreshToken: hashedRefreshToken,
      },
    });
  }

  private async getTokens(userId: string, email: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: userId,
          email,
        },
        {
          secret: process.env.JWT_SECRET,
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        {
          sub: userId,
          email,
        },
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: '7d',
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
