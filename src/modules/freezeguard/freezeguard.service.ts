import { Injectable } from '@nestjs/common';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { RiskService } from '../risk-fusion/risk.service';
import { TelemetryDto } from './dto/telemetry.dto';

export interface TelemetryAssessment {
  takeoverDetected: boolean;
  signals: string[];
  observations: string[];
  riskEventId?: string;
  riskScore?: number;
  riskLevel?: string;
  interventionTriggered?: boolean;
}

/**
 * FREEZEGUARD — ingests technical telemetry (remote-access tools, screen-share,
 * clipboard control, etc.) and, when it indicates a takeover, raises a scored
 * RiskEvent so the risk pipeline can escalate to FreezeLock (PDF §20).
 */
@Injectable()
export class FreezeGuardService {
  constructor(private readonly risk: RiskService) {}

  async ingestTelemetry(
    user: AuthenticatedUser,
    dto: TelemetryDto,
    ctx: RequestContext = {},
  ): Promise<TelemetryAssessment> {
    const signals: string[] = [];
    const observations: string[] = [];

    if (dto.remoteAccessTools && dto.remoteAccessTools.length > 0) {
      signals.push('REMOTE_ACCESS');
      observations.push(`remote-access tool(s): ${dto.remoteAccessTools.join(', ')}`);
    }
    if (dto.remoteInputDetected) {
      signals.push('REMOTE_INPUT');
      observations.push('remote keyboard/mouse input');
    }
    if (dto.clipboardHijackDetected) {
      signals.push('CLIPBOARD_HIJACK');
      observations.push('clipboard hijack');
    }
    if (dto.screenSharing) {
      signals.push('SCREEN_SHARE');
      observations.push('screen sharing active');
    }
    if (dto.suspiciousBrowserActivity) {
      signals.push('SUSPICIOUS_BROWSER');
      observations.push('suspicious browser activity');
    }
    if (dto.bankingSiteOpen && (dto.screenSharing || (dto.remoteAccessTools?.length ?? 0) > 0)) {
      signals.push('DEVICE_COMPROMISE');
      observations.push('banking site open during a remote/shared session');
    }

    if (signals.length === 0) {
      return {
        takeoverDetected: false,
        signals: [],
        observations: ['No technical-takeover indicators in this telemetry.'],
      };
    }

    const result = await this.risk.createRiskEvent(
      user,
      {
        eventType: 'TECHNICAL_TAKEOVER_TELEMETRY',
        triggerReason: `FREEZEGUARD telemetry: ${observations.join('; ')}`,
        signals,
        moduleSource: 'FREEZEGUARD',
        sessionId: dto.sessionId,
      },
      ctx,
    );

    return {
      takeoverDetected: true,
      signals,
      observations,
      riskEventId: result.riskEvent.id,
      riskScore: result.riskEvent.riskScore,
      riskLevel: result.riskEvent.riskLevel,
      interventionTriggered: result.interventionTriggered,
    };
  }
}
