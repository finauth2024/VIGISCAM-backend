import { Injectable } from '@nestjs/common';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { RiskService } from '../risk-fusion/risk.service';
import { detectScamLanguage, PhraseMatch } from './a1scamshield.detection';
import { AnalyzeTextDto } from './dto/analyze-text.dto';

export interface ScamLanguageAssessment {
  scamDetected: boolean;
  matches: PhraseMatch[];
  tactics: string[];
  signals: string[];
  scamScore?: number;
  riskLevel?: string;
  recommendedAction?: string;
  interventionTriggered?: boolean;
  riskEventId?: string;
}

/**
 * A1SCAMSHIELD — live scam-language detection (PDF §17). Phase 1 runs the
 * deterministic phrase detector; a positive result raises a scored RiskEvent
 * so the risk pipeline can escalate.
 */
@Injectable()
export class A1ScamShieldService {
  constructor(private readonly risk: RiskService) {}

  async analyze(
    user: AuthenticatedUser,
    dto: AnalyzeTextDto,
    ctx: RequestContext = {},
  ): Promise<ScamLanguageAssessment> {
    const detection = detectScamLanguage(dto.text);

    if (detection.matches.length === 0) {
      return { scamDetected: false, matches: [], tactics: [], signals: [] };
    }

    const result = await this.risk.createRiskEvent(
      user,
      {
        eventType: 'SCAM_LANGUAGE_DETECTED',
        triggerReason: `A1SCAMSHIELD matched ${detection.matches.length} scam-language pattern(s): ${detection.tactics.join(', ')}`,
        signals: detection.signals,
        moduleSource: 'A1SCAMSHIELD',
        sessionId: dto.sessionId,
      },
      ctx,
    );

    return {
      scamDetected: true,
      matches: detection.matches,
      tactics: detection.tactics,
      signals: detection.signals,
      scamScore: result.riskEvent.riskScore,
      riskLevel: result.riskEvent.riskLevel,
      recommendedAction: result.riskEvent.recommendedAction,
      interventionTriggered: result.interventionTriggered,
      riskEventId: result.riskEvent.id,
    };
  }
}
