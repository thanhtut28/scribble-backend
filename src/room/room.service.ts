import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto, JoinRoomDto } from './dto';
import { hash, verify } from 'argon2';
import { RoomStatus } from '@prisma/client';

@Injectable()
export class RoomService {
  constructor(private prisma: PrismaService) {}

  async createRoom(userId: string, dto: CreateRoomDto) {
    let hashedPassword: string | null = null;

    if (dto.isPrivate && dto.password) {
      hashedPassword = await hash(dto.password);
    }

    const room = await this.prisma.room.create({
      data: {
        name: dto.name,
        maxPlayers: dto.maxPlayers || 8,
        rounds: dto.rounds || 8,
        isPrivate: dto.isPrivate || false,
        password: hashedPassword,
        ownerId: userId,
        users: {
          create: {
            userId,
            isReady: true,
          },
        },
      },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
        owner: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // Remove sensitive information
    if (room.password) {
      const { password, ...roomWithoutPassword } = room;
      return roomWithoutPassword;
    }

    return room;
  }

  async joinRoom(userId: string, dto: JoinRoomDto) {
    // Check if room exists
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      include: {
        users: true,
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if room is full
    if (room.users.length >= room.maxPlayers) {
      throw new BadRequestException('Room is full');
    }

    // Check if user is already in the room
    const existingUserRoom = await this.prisma.userRoom.findUnique({
      where: {
        userId_roomId: {
          userId,
          roomId: dto.roomId,
        },
      },
    });

    if (existingUserRoom) {
      throw new BadRequestException('You are already in this room');
    }

    // Check if room is private and requires password
    if (room.isPrivate && room.password) {
      if (!dto.password) {
        throw new ForbiddenException('Password is required for this room');
      }

      const passwordMatches = await verify(room.password, dto.password);
      if (!passwordMatches) {
        throw new ForbiddenException('Invalid password');
      }
    }

    // Check if game is already in progress
    if (room.status === RoomStatus.PLAYING) {
      throw new BadRequestException('Game is already in progress');
    }

    // Join the room
    await this.prisma.userRoom.create({
      data: {
        userId,
        roomId: dto.roomId,
      },
    });

    // Return updated room details
    const updatedRoom = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
        owner: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // Remove sensitive information
    if (updatedRoom?.password) {
      const { password, ...roomWithoutPassword } = updatedRoom;
      return roomWithoutPassword;
    }

    return updatedRoom;
  }

  async leaveRoom(userId: string, roomId: string) {
    // Check if room exists
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        users: true,
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if user is in the room
    const userRoom = await this.prisma.userRoom.findUnique({
      where: {
        userId_roomId: {
          userId,
          roomId,
        },
      },
    });

    if (!userRoom) {
      throw new BadRequestException('You are not in this room');
    }

    // If user is the owner and there are other players, make someone else the owner
    if (room.ownerId === userId && room.users.length > 1) {
      // Find another user who is not the current owner
      const newOwner = room.users.find(
        (userRoom) => userRoom.userId !== userId,
      );

      if (newOwner) {
        // Update room with new owner
        await this.prisma.room.update({
          where: { id: roomId },
          data: {
            ownerId: newOwner.userId,
          },
        });
      }
    }

    // Remove user from room
    await this.prisma.userRoom.delete({
      where: {
        userId_roomId: {
          userId,
          roomId,
        },
      },
    });

    // If user is the owner and they're the only one in the room, delete the room
    if (room.ownerId === userId && room.users.length <= 1) {
      await this.prisma.room.delete({
        where: { id: roomId },
      });
      return { message: 'Room deleted as you were the last player' };
    }

    // Return updated room details
    const updatedRoom = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
        owner: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!updatedRoom) {
      return { message: 'Room deleted as you were the last player' };
    }

    // Remove sensitive information
    if (updatedRoom?.password) {
      const { password, ...roomWithoutPassword } = updatedRoom;
      return roomWithoutPassword;
    }

    return updatedRoom;
  }

  async getRooms() {
    const rooms = await this.prisma.room.findMany({
      where: {
        status: RoomStatus.WAITING,
      },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
        owner: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // Remove sensitive information from all rooms
    return rooms.map((room) => {
      if (room.password) {
        const { password, ...roomWithoutPassword } = room;
        return roomWithoutPassword;
      }
      return room;
    });
  }

  async getRoomById(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
        owner: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Remove sensitive information
    if (room.password) {
      const { password, ...roomWithoutPassword } = room;
      return roomWithoutPassword;
    }

    return room;
  }
}
