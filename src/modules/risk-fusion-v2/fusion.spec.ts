import { fuseRiskScore, RISK_FUSION_V2_VERSION } from './fusion';

describe('Risk Fusion v2 scoring', () => {
  it('sums all layers and clamps to [0,100]', () => {
    const r = fuseRiskScore({
      baseScore: 40,
      stage: 'PAYMENT_REQUEST',           // +30
      victimState: 'COMPROMISED',          // +25
      predictedAction: 'REQUEST_GIFT_CARD', // +18
      authenticityFailures: 1,             // +15
    });
    // 40+30+25+18+15 = 128 → clamped 100
    expect(r.fusedScore).toBe(100);
    expect(r.fusedLevel).toBe('CRITICAL');
    expect(r.fusedVersion).toBe(RISK_FUSION_V2_VERSION);
  });

  it('records every contributing layer in the breakdown', () => {
    const r = fuseRiskScore({
      baseScore: 10,
      stage: 'INITIAL_CONTACT',
      victimState: 'CALM',
      predictedAction: 'DROP_OFF',
      authenticityFailures: 0,
    });
    expect(r.breakdown).toMatchObject({
      baseScore: 10,
      fraudJourneyBoost: 5,
      victimStateBoost: 0,
      predictedMoveBoost: 0,
      authenticityPenalty: 0,
    });
    expect(r.fusedScore).toBe(15);
    expect(r.fusedLevel).toBe('LOW');
  });

  it('caps the authenticity penalty at 30 regardless of failure count', () => {
    const r = fuseRiskScore({
      baseScore: 0,
      stage: 'INITIAL_CONTACT',
      victimState: 'CALM',
      predictedAction: 'DROP_OFF',
      authenticityFailures: 10,
    });
    expect(r.breakdown.authenticityPenalty).toBe(30);
  });

  it('treats INTERVENED stage as no boost', () => {
    const r = fuseRiskScore({
      baseScore: 50,
      stage: 'INTERVENED',
      victimState: 'CALM',
      predictedAction: 'DROP_OFF',
      authenticityFailures: 0,
    });
    expect(r.breakdown.fraudJourneyBoost).toBe(0);
    expect(r.fusedScore).toBe(50);
  });

  it('clamps negative base scores to 0', () => {
    const r = fuseRiskScore({
      baseScore: -10,
      stage: 'INITIAL_CONTACT',
      victimState: 'CALM',
      predictedAction: 'DROP_OFF',
      authenticityFailures: 0,
    });
    expect(r.fusedScore).toBe(0);
    expect(r.fusedLevel).toBe('LOW');
  });
});
