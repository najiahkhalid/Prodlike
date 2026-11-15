import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import {
  ATTEMPTS_NAMESPACE,
  AUTH_COOKIES,
  SocketEvents,
  type AccessTokenClaims,
  type EngineSnapshot,
  type MetricsTickPayload,
  type PipelineLogPayload,
} from '@prodlike/shared';
import { TokensService } from '../auth/tokens.service';
import { EngineBus } from './engine-bus';
import { AttemptsService } from '../attempts/attempts.service';

const room = (attemptId: string) => `attempt:${attemptId}`;

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Real-time channel for the workspace (ADR-004, ADR-007, NFR-03).
 * Auth: the same httpOnly access cookie as the REST API, checked on connect.
 * Authorisation: a socket may only join rooms of attempts its user owns.
 * (Session cookies are SameSite=Lax, so another site cannot open a socket as the user.)
 */
@WebSocketGateway({ namespace: ATTEMPTS_NAMESPACE, cors: { origin: true, credentials: true } })
export class EngineGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  private readonly logger = new Logger(EngineGateway.name);
  @WebSocketServer() server!: Namespace;

  private readonly onSnapshot = (s: EngineSnapshot) =>
    this.server.to(room(s.attemptId)).emit(SocketEvents.snapshot, s);
  private readonly onMetrics = (m: MetricsTickPayload) =>
    this.server.to(room(m.attemptId)).emit(SocketEvents.metricsTick, m);
  private readonly onLog = (p: PipelineLogPayload) =>
    this.server.to(room(p.attemptId)).emit(SocketEvents.pipelineLog, p);

  constructor(
    private readonly tokens: TokensService,
    private readonly bus: EngineBus,
    private readonly attempts: AttemptsService,
  ) {}

  afterInit() {
    this.bus.on('snapshot', this.onSnapshot);
    this.bus.on('metrics', this.onMetrics);
    this.bus.on('pipelineLog', this.onLog);
  }

  onModuleDestroy() {
    this.bus.off('snapshot', this.onSnapshot);
    this.bus.off('metrics', this.onMetrics);
    this.bus.off('pipelineLog', this.onLog);
  }

  async handleConnection(socket: Socket) {
    const token = readCookie(socket.handshake.headers.cookie, AUTH_COOKIES.access);
    try {
      if (!token) throw new Error('no session');
      socket.data.user = await this.tokens.verifyAccess(token);
    } catch {
      socket.emit('error', { code: 'UNAUTHENTICATED', message: 'You are not signed in.' });
      socket.disconnect(true);
    }
  }

  @SubscribeMessage(SocketEvents.join)
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { attemptId?: string }) {
    const user = socket.data.user as AccessTokenClaims | undefined;
    if (!user || typeof body?.attemptId !== 'string') return { error: 'NOT_FOUND' };
    try {
      const snapshot = await this.attempts.liveSnapshot(user, body.attemptId);
      await socket.join(room(body.attemptId));
      return snapshot;
    } catch {
      // Same answer for "does not exist" and "not yours" (ids reveal nothing).
      return { error: 'NOT_FOUND' };
    }
  }
}
