import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const client: Socket = context.switchToWs().getClient();
      const token = (client.handshake.auth.token ||
        client.handshake.headers.authorization?.split(' ')[1]) as string;

      if (!token) {
        throw new WsException('Unauthorized');
      }

      const payload: unknown = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      // Attach user to socket data for later use
      client.data.user = payload;

      return true;
    } catch (err) {
      throw new WsException('Unauthorized');
    }
  }
}
