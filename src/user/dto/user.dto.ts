import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  password?: string;
}

export class UserResponseDto {
  id: string;
  email: string;
  username: string;
  gamesPlayed: number;
  gamesWon: number;
  totalScore: number;
  createdAt: Date;
}
