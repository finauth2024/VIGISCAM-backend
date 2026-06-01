/**
 * In-process tests for the bus's own logic. The cross-process pub/sub
 * round-trip is exercised by the contract suite against a real Redis
 * (gated on REDIS_URL, same pattern as Prisma DATABASE_URL).
 */
import { CacheInvalidationBus } from './cache-invalidation-bus';

describe('CacheInvalidationBus (no REDIS_URL)', () => {
  it('start() is a no-op and isConnected stays false', async () => {
    const bus = new CacheInvalidationBus(undefined, () => undefined);
    await bus.start();
    expect(bus.isConnected()).toBe(false);
    await bus.stop();
  });

  it('publish() is a no-op (never throws) without a publisher', async () => {
    const bus = new CacheInvalidationBus(undefined, () => undefined);
    await bus.start();
    expect(() => bus.publish({ op: 'delete', key: 'k' })).not.toThrow();
    expect(() => bus.publish({ op: 'deletePrefix', prefix: 'p:' })).not.toThrow();
    await bus.stop();
  });

  it('stop() is safe to call even when start() was never called', async () => {
    const bus = new CacheInvalidationBus(undefined, () => undefined);
    await bus.stop();
    expect(bus.isConnected()).toBe(false);
  });
});
