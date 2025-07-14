import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsOptional,
  IsNumber,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StartGameDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;
}

export class GuessDto {
  @IsString()
  @IsNotEmpty()
  gameId: string;

  @IsString()
  @IsNotEmpty()
  guess: string;
}

export class DrawingPointDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;
}

export class DrawingPathDto {
  @IsBoolean()
  drawMode: boolean;

  @IsString()
  strokeColor: string;

  @IsNumber()
  strokeWidth: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DrawingPointDto)
  points: DrawingPointDto[];
}

export class UpdateDrawingDto {
  @IsString()
  @IsNotEmpty()
  gameId: string;

  @IsString()
  @IsNotEmpty()
  roundId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DrawingPathDto)
  paths: DrawingPathDto[];
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  gameId: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class GameStateDto {
  @IsString()
  id: string;

  @IsString()
  roomId: string;

  @IsNumber()
  currentRoundNum: number;

  @IsString()
  status: string;

  @IsString()
  startedAt: string;

  @IsOptional()
  @IsString()
  endedAt?: string;

  @IsArray()
  rounds: RoundStateDto[];

  @IsArray()
  scores: GameScoreDto[];

  @IsArray()
  messages: MessageDto[];
}

export class RoundStateDto {
  @IsString()
  id: string;

  @IsString()
  gameId: string;

  @IsNumber()
  roundNumber: number;

  @IsString()
  word: string;

  @IsOptional()
  @IsString()
  drawerId?: string;

  @IsString()
  status: string;

  @IsString()
  startedAt: string;

  @IsOptional()
  @IsString()
  endedAt?: string;

  @IsArray()
  @IsOptional()
  drawings?: DrawingDto[];
}

export class DrawingDto {
  @IsString()
  id: string;

  @IsString()
  roundId: string;

  @IsString()
  userId: string;

  @IsArray()
  paths: any[];

  @IsString()
  createdAt: string;
}

export class GameScoreDto {
  @IsString()
  id: string;

  @IsString()
  gameId: string;

  @IsString()
  userId: string;

  @IsNumber()
  score: number;

  @IsNumber()
  correct: number;

  @IsString()
  createdAt: string;

  @IsString()
  updatedAt: string;
}

export class MessageDto {
  @IsString()
  id: string;

  @IsString()
  gameId: string;

  @IsString()
  userId: string;

  @IsString()
  content: string;

  @IsBoolean()
  isCorrect: boolean;

  @IsString()
  createdAt: string;
}
