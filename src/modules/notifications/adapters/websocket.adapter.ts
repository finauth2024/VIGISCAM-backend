import { Injectable, Logger } from '@nestjs/common';
import { EventsService } from '../../../common/events/events.service';
import { AdapterResult, ChannelAdapter, NotificationSendArgs } from './adapter.types';

/**
 * Real-time WebSocket adapter — emits a generic `risk.alert` event over
 * the Phase 8C gateway to the user-scoped room (recipient = userId).
 *
 * Always "configured" because the gateway is always wired; if no socket
 * is connected at the moment, socket.io silently drops the emit — no
 * error, no retry needed.
 */
@Injectable()
export class WebsocketAdapter implements ChannelAdapter {
  readonly channel = 'WEBSOCKET' as const;
  private readonly logger = new Logger(WebsocketAdapter.name);

  constructor(private readonly events: EventsService) {}

  isConfigured(): boolean {
    return true;
  }

  send(args: NotificationSendArgs): Promise<AdapterResult> {
    const tenantId = args.metadata?.tenantId as string | undefined;
    if (!tenantId) {
      return Promise.resolve({
        ok: false,
        error: 'websocket emit requires metadata.tenantId',
      });
    }
    this.events.emitRiskAlert(tenantId, {
      riskLevel: (args.metadata?.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
      reason: args.body,
      evidenceEventId: args.metadata?.evidenceEventId as string | undefined,
    });
    return Promise.resolve({ ok: true });
  }
}
