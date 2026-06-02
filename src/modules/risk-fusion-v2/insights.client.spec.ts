import { InsightsClient } from './insights.client';

function makeConfig(aiServiceUrl?: string) {
  return {
    get: (key: string) => (key === 'aiServiceUrl' ? aiServiceUrl : undefined),
  } as never;
}

describe('InsightsClient (stub mode — no AI_SERVICE_URL)', () => {
  const client = new InsightsClient(makeConfig(undefined));

  it('reports the external tier as not configured', () => {
    expect(client.isExternalConfigured()).toBe(false);
  });

  it('assessJourney falls back to the stub and reports source STUB', async () => {
    const res = await client.assessJourney({ transcript: 'please send a wire transfer now' });
    expect(res.source).toBe('STUB');
    expect(res.output.stage).toBe('PAYMENT_REQUEST');
    expect(res.output.modelVersion).toContain('stub');
  });

  it('assessVictimState falls back to the stub and reports source STUB', async () => {
    const res = await client.assessVictimState({ transcript: "okay i'll do it" });
    expect(res.source).toBe('STUB');
    expect(res.output.state).toBe('COMPROMISED');
  });

  it('predictNextMove falls back to the stub and reports source STUB', async () => {
    const res = await client.predictNextMove('PAYMENT_REQUEST');
    expect(res.source).toBe('STUB');
    expect(res.output.action).toBe('REQUEST_GIFT_CARD');
  });
});

describe('InsightsClient (external configured but unreachable)', () => {
  const client = new InsightsClient(makeConfig('http://127.0.0.1:1/ai'));

  it('reports the external tier as configured', () => {
    expect(client.isExternalConfigured()).toBe(true);
  });

  it('falls back to the stub when the external call fails', async () => {
    // Force fetch to reject so we exercise the catch → stub path.
    const original = global.fetch;
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as never;
    try {
      const res = await client.assessJourney({ transcript: 'urgent send money' });
      expect(res.source).toBe('STUB');
      expect(res.output.modelVersion).toContain('stub');
    } finally {
      global.fetch = original;
    }
  });

  it('uses the external output and reports source EXTERNAL on a 2xx', async () => {
    const original = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        stage: 'TRUST_BUILDING',
        confidence: 91,
        modelVersion: 'fraud-journey-ext-2.0.0',
        evidence: { matchedKeywords: ['ext'] },
      }),
    })) as never;
    try {
      const res = await client.assessJourney({ transcript: 'anything' });
      expect(res.source).toBe('EXTERNAL');
      expect(res.output.modelVersion).toBe('fraud-journey-ext-2.0.0');
      expect(res.output.confidence).toBe(91);
    } finally {
      global.fetch = original;
    }
  });

  it('falls back to the stub on a non-2xx response', async () => {
    const original = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 })) as never;
    try {
      const res = await client.assessVictimState({ transcript: 'scared and threatened' });
      expect(res.source).toBe('STUB');
      expect(res.output.state).toBe('ALARMED');
    } finally {
      global.fetch = original;
    }
  });
});
