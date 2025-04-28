import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { GetUser } from '../auth/decorators';
import { JwtGuard } from '../auth/guards';
import { UpdateUserDto } from './dto/user.dto';

@UseGuards(JwtGuard)
@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  getMe(@GetUser('id') userId: string) {
    return this.userService.getUser(userId);
  }

  @Get('leaderboard')
  getLeaderboard() {
    return this.userService.getLeaderboard();
  }

  @Get(':username')
  getUserByUsername(@Param('username') username: string) {
    return this.userService.getUserByUsername(username);
  }

  @Patch()
  updateUser(@GetUser('id') userId: string, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser(userId, dto);
  }
}
