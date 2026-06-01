import { Injectable } from '@nestjs/common';
import {
  EVENT_CHANNELS,
  FreezeLockTriggeredPayload,
  GuardianPauseCountdownPayload,
  RiskAlertPayload,
  TrustedContactReviewRequestPayload,
} from './event-channels';
import { EventsGateway } from './events.gateway';

/**
 * High-level API consumed by Phase 9 modules. The gateway is the wire
 * mechanism; this service is the typed front door. Module code calls
 * `events.emitRiskAlert(tenantId, payload)` — never `gateway.server.emit(...)`.
 *
 * The split exists so future implementation changes (e.g. swapping
 * socket.io for SSE, or fanning out to multiple transport gateways) only
 * touch the gateway, not every consuming module.
 */
@Injectable()
export class EventsService {
  constructor(private readonly gateway: EventsGateway) {}

  emitRiskAlert(tenantId: string, payload: RiskAlertPayload): void {
    this.gateway.emitToTenant(tenantId, EVENT_CHANNELS.RiskAlert, payload);
  }

  emitGuardianPauseCountdown(userId: string, payload: GuardianPauseCountdownPayload): void {
    this.gateway.emitToUser(userId, EVENT_CHANNELS.GuardianPauseCountdown, payload);
  }

  emitTrustedContactReviewRequest(
    contactUserId: string,
    payload: TrustedContactReviewRequestPayload,
  ): void {
    this.gateway.emitToUser(contactUserId, EVENT_CHANNELS.TrustedContactReviewRequest, payload);
  }

  emitFreezeLockTriggered(tenantId: string, payload: FreezeLockTriggeredPayload): void {
    this.gateway.emitToTenant(tenantId, EVENT_CHANNELS.FreezeLockTriggered, payload);
  }
}
