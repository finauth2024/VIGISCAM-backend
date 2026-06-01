/**
 * Phase 8A contract — proves cross-process cache invalidation works against
 * a real Redis broker. Two CacheInvalidationBus instances simulate two
 * backend nodes; a publish on one must arrive on the other and NOT echo
 * back to the publisher.
 *
 * Skipped when REDIS_URL is unset.
 */
import {
  CacheInvalidationBus,
  InvalidationMessage,
} from '../../src/common/cache/cache-invalidation-bus';
import { loadEnv } from './helpers';

const env = loadEnv();
const shouldRun = env?.redisUrl;
const describeIfRedis = shouldRun ? describe : describe.skip;

describeIfRedis('Cache invalidation bus (Phase 8A, cross-process)', () => {
  const redisUrl = env!.redisUrl!;
  let nodeA: CacheInvalidationBus;
  let nodeB: CacheInvalidationBus;
  let receivedOnA: InvalidationMessage[];
  let receivedOnB: InvalidationMessage[];

  beforeAll(async () => {
    receivedOnA = [];
    receivedOnB = [];
    nodeA = new CacheInvalidationBus(redisUrl, (m) => receivedOnA.push(m));
    nodeB = new CacheInvalidationBus(redisUrl, (m) => receivedOnB.push(m));
    await nodeA.start();
    await nodeB.start();
    // Give pub/sub a moment to wire up before the first publish.
    await wait(100);
  });

  afterAll(async () => {
    await nodeA.stop();
    await nodeB.stop();
  });

  it('a delete on node A lands on node B', async () => {
    receivedOnA.length = 0;
    receivedOnB.length = 0;
    nodeA.publish({ op: 'delete', key: 'phase-8a-key' });
    await wait(150);
    expect(receivedOnB).toContainEqual({
      op: 'delete',
      key: 'phase-8a-key',
    });
  });

  it('a prefix sweep on node A lands on node B', async () => {
    receivedOnA.length = 0;
    receivedOnB.length = 0;
    nodeA.publish({ op: 'deletePrefix', prefix: 'phase-8a:' });
    await wait(150);
    expect(receivedOnB).toContainEqual({
      op: 'deletePrefix',
      prefix: 'phase-8a:',
    });
  });

  it("does NOT echo node A's own publishes back to node A", async () => {
    receivedOnA.length = 0;
    receivedOnB.length = 0;
    nodeA.publish({ op: 'delete', key: 'phase-8a-echo' });
    await wait(150);
    expect(receivedOnA).toEqual([]);
  });
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
