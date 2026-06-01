import { scoreWalletGuard } from './walletguard.scoring';

describe('WalletGuard scoring', () => {
  it('an unknown wallet with no signals is LOW', () => {
    const r = scoreWalletGuard({});
    expect(r.score).toBe(0);
    expect(r.level).toBe('LOW');
  });

  it('CONFIRMED_SCAM reputation alone is HIGH', () => {
    const r = scoreWalletGuard({ reputation: 'CONFIRMED_SCAM' });
    expect(r.score).toBe(80);
    expect(r.level).toBe('HIGH');
  });

  it('clipboard swap alone is LOW (just 30), but combined with anything tips to HIGH', () => {
    const onlySwap = scoreWalletGuard({ clipboardSwapDetected: true });
    expect(onlySwap.score).toBe(30);
    expect(onlySwap.level).toBe('LOW');

    const swapPlusContext = scoreWalletGuard({
      clipboardSwapDetected: true,
      urgencyDetected: true,
      walletSwitched: true,
    });
    // 30 + 20 + 15 = 65 → HIGH
    expect(swapPlusContext.score).toBe(65);
    expect(swapPlusContext.level).toBe('HIGH');
  });

  it('SUSPICIOUS_WALLET + clipboard swap + urgency + secrecy is CRITICAL', () => {
    const r = scoreWalletGuard({
      reputation: 'SUSPICIOUS_WALLET',
      clipboardSwapDetected: true,
      urgencyDetected: true,
      secrecyDetected: true,
    });
    // 50 + 30 + 15 + 15 = 110 → caps 100 → CRITICAL
    expect(r.score).toBe(100);
    expect(r.level).toBe('CRITICAL');
  });

  it('graphMatchScore contributes up to +30, scaled (score/3 capped 30)', () => {
    expect(scoreWalletGuard({ graphMatchScore: 30 }).breakdown.graphMatch).toBe(10);
    expect(scoreWalletGuard({ graphMatchScore: 90 }).breakdown.graphMatch).toBe(30);
    expect(scoreWalletGuard({ graphMatchScore: 100 }).breakdown.graphMatch).toBe(30);
    expect(scoreWalletGuard({ graphMatchScore: null }).breakdown.graphMatch).toBe(0);
  });

  it('prior warnings cap at +20', () => {
    expect(scoreWalletGuard({ priorWarningsCount: 100 }).breakdown.priorWarnings).toBe(20);
    expect(scoreWalletGuard({ priorWarningsCount: 4 }).breakdown.priorWarnings).toBe(20);
    expect(scoreWalletGuard({ priorWarningsCount: 2 }).breakdown.priorWarnings).toBe(10);
  });

  it('breakdown sums to score when not capped', () => {
    const r = scoreWalletGuard({
      reputation: 'NEW',
      urgencyDetected: true,
      graphMatchScore: 60,
    });
    const sum = Object.values(r.breakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.score);
  });
});
