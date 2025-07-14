import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class JoinRoomDto {
  @IsNotEmpty()
  @IsString()
  roomId: string;

  @IsOptional()
  @IsString()
  password?: string;
}
