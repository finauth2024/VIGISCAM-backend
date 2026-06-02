import { AiStatusService } from './ai-status.service';

function makeConfig(aiServiceUrl?: string) {
  return {
    get: (key: string) => (key === 'aiServiceUrl' ? aiServiceUrl : undefined),
  } as never;
}

function makePrisma(groups: Array<Record<string, unknown>> = []) {
  return {
    aIDecision: {
      groupBy: jest.fn(async () => groups),
    },
  } as never;
}

describe('AiStatusService.status', () => {
  it('reports STUB mode for every engine when AI_SERVICE_URL is unset', () => {
    const svc = new AiStatusService(makeConfig(undefined), makePrisma());
    const out = svc.status();
    expect(out.aiServiceConfigured).toBe(false);
    expect(out.defaultMode).toBe('STUB');
    expect(out.engines.length).toBeGreaterThanOrEqual(7);
    for (const e of out.engines) {
      expect(e.mode).toBe('STUB');
      expect(e.fallback).toBe('STUB');
    }
  });

  it('reports EXTERNAL mode for every engine when AI_SERVICE_URL is set', () => {
    const svc = new AiStatusService(makeConfig('https://ai.vigiscam.internal'), makePrisma());
    const out = svc.status();
    expect(out.aiServiceConfigured).toBe(true);
    expect(out.defaultMode).toBe('EXTERNAL');
    expect(out.engines.every((e) => e.mode === 'EXTERNAL')).toBe(true);
  });

  it('lists the expected engine set', () => {
    const svc = new AiStatusService(makeConfig(), makePrisma());
    const kinds = svc.status().engines.map((e) => e.serviceKind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'NLP_CLASSIFIER',
        'EMBEDDING',
        'AUTHENTICITY',
        'OSINT',
        'FRAUD_JOURNEY',
        'VICTIM_STATE',
        'PREDICTED_NEXT_MOVE',
      ]),
    );
  });
});

describe('AiStatusService.usage', () => {
  it('flattens the Prisma groupBy into a tally', async () => {
    const svc = new AiStatusService(
      makeConfig(),
      makePrisma([
        { serviceKind: 'FRAUD_JOURNEY', source: 'STUB', _count: { _all: 3 } },
        { serviceKind: 'NLP_CLASSIFIER', source: 'EXTERNAL', _count: { _all: 5 } },
      ]),
    );
    const out = await svc.usage();
    expect(out).toEqual([
      { serviceKind: 'FRAUD_JOURNEY', source: 'STUB', count: 3 },
      { serviceKind: 'NLP_CLASSIFIER', source: 'EXTERNAL', count: 5 },
    ]);
  });
});
