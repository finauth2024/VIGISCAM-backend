import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/auth.types';
import { EventChannel, EventPayloads, tenantRoom, userRoom } from './event-channels';

/**
 * Real-time WebSocket gateway (Phase 8C).
 *
 * Authentication on connect: clients pass a Bearer access token via the
 * Socket.IO handshake (`auth: { token }` or the standard `Authorization`
 * header). The gateway verifies the JWT with the same secret as the HTTP
 * JwtAuthGuard, so a single login flow works for both surfaces.
 *
 * Authorization on connect: every authenticated socket is added to
 * `tenant:<id>` and `user:<id>` rooms. Emit helpers fan out to the
 * appropriate room — a tenant-A client can never receive a tenant-B
 * message because socket.io only delivers within the joined room.
 *
 * Channels are named in `event-channels.ts`. Consuming modules should
 * NOT use `server.emit(...)` directly — they go through `EventsService`,
 * which the gateway exposes a typed API for.
 */
@WebSocketGateway({
  path: '/ws',
  cors: {
    // CORS for the WebSocket transport is independent of the HTTP CORS
    // config. The same allow-list logic could be wired here later (8C is
    // about the substrate; per-environment origin policy lives in 8D/FE-4).
    origin: true,
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(socket: Socket): Promise<void> {
    const token = this.extractToken(socket);
    if (!token) {
      this.logger.warn(`Socket ${socket.id} rejected: missing bearer`);
      socket.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      if (payload.type !== 'access' || !payload.sub || !payload.tenantId) {
        throw new Error('not an access token');
      }
      // Attach for later disconnect bookkeeping and authz checks.
      (socket.data as { userId: string; tenantId: string }) = {
        userId: payload.sub,
        tenantId: payload.tenantId,
      };
      await socket.join(tenantRoom(payload.tenantId));
      await socket.join(userRoom(payload.sub));
      this.logger.log(
        `Socket ${socket.id} connected as user=${payload.sub} tenant=${payload.tenantId}`,
      );
    } catch (err) {
      this.logger.warn(`Socket ${socket.id} rejected: ${String(err)}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    const data = socket.data as { userId?: string; tenantId?: string };
    this.logger.log(`Socket ${socket.id} disconnected (user=${data?.userId ?? '?'})`);
  }

  // ─── Typed emit helpers (internal — used by EventsService) ────────────────

  emitToTenant<C extends EventChannel>(
    tenantId: string,
    channel: C,
    payload: EventPayloads[C],
  ): void {
    this.server.to(tenantRoom(tenantId)).emit(channel, payload);
  }

  emitToUser<C extends EventChannel>(userId: string, channel: C, payload: EventPayloads[C]): void {
    this.server.to(userRoom(userId)).emit(channel, payload);
  }

  private extractToken(socket: Socket): string | null {
    // Prefer the dedicated socket.io auth field; fall back to the
    // standard Authorization header for clients that don't speak it.
    const handshakeAuth = socket.handshake.auth as { token?: unknown } | undefined;
    const fromAuth = handshakeAuth?.token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) {
      return fromAuth.startsWith('Bearer ') ? fromAuth.substring(7) : fromAuth;
    }
    const headerValue = socket.handshake.headers.authorization;
    const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.substring(7);
    }
    return null;
  }
}
