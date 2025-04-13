import { Controller, Get } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Public } from 'src/auth/decorators';

@Controller('user')
export class UserController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get('all')
  getAllUsers() {
    return this.prisma.user.findMany();
  }
}
