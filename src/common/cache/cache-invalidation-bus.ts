import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Cross-process cache-invalidation broadcaster, backed by Redis pub/sub.
 *
 * Design rationale: Phase 7 callers expect a **synchronous** `cache.get(key)`
 * because the registry hot path is small, latency-sensitive and already
 * shielded from the DB by an in-process Map. Forcing every caller to be
 * async (which is what a remote Redis read implies) would be a huge churn.
 *
 * Instead, we keep the in-process Map per node (each node warms its own
 * cache from the DB), and use Redis pub/sub to broadcast invalidation
 * messages so that writes on one node never leave stale data on another.
 * Cache misses still go to the DB exactly once per node — the price of
 * keeping the hot path synchronous, and acceptable at our QPS.
 *
 * Two message types on channel `vigiscam:cache:invalidate`:
 *   - `{op: "delete", key: "..."}`         — single-key delete
 *   - `{op: "deletePrefix", prefix: "..."}` — prefix sweep
 *
 * Publisher and subscriber are SEPARATE ioredis connections because ioredis
 * puts a subscribed client in "subscribe mode" and refuses other commands.
 */

export type InvalidationMessage =
  | { op: 'delete'; key: string }
  | { op: 'deletePrefix'; prefix: string };

export type LocalInvalidator = (msg: InvalidationMessage) => void;

const CHANNEL = 'vigiscam:cache:invalidate';

export class CacheInvalidationBus {
  private readonly logger = new Logger(CacheInvalidationBus.name);
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private readonly nodeId: string;

  /**
   * @param redisUrl  Optional. If unset, this bus becomes a no-op (single-
   *                  process mode — local invalidation still works through
   *                  the CacheService's own Map).
   * @param onMessage Hook the CacheService passes in so incoming messages
   *                  can be applied to its local Map.
   */
  constructor(
    private readonly redisUrl: string | undefined,
    private readonly onMessage: LocalInvalidator,
  ) {
    // Tag each message with the node that emitted it so subscribers can
    // ignore their own echo. Without this, every publish triggers a
    // pointless local delete after the local Map has already been updated.
    this.nodeId = process.env.HOSTNAME ?? `node-${Math.random().toString(36).slice(2, 10)}`;
  }

  async start(): Promise<void> {
    if (!this.redisUrl) {
      this.logger.log(
        'No REDIS_URL — cache invalidation is single-process only. ' +
          'Set REDIS_URL to enable cross-process invalidation.',
      );
      return;
    }
    this.publisher = new Redis(this.redisUrl, { lazyConnect: true });
    this.subscriber = new Redis(this.redisUrl, { lazyConnect: true });
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);

    this.subscriber.on('message', (_channel, payload) => {
      try {
        const wire = JSON.parse(payload) as InvalidationMessage & { nodeId?: string };
        if (wire.nodeId === this.nodeId) return; // ignore our own echo
        const { nodeId: _omit, ...msg } = wire;
        this.onMessage(msg as InvalidationMessage);
      } catch (err) {
        this.logger.warn(`Discarded malformed invalidation payload: ${String(err)}`);
      }
    });
    await this.subscriber.subscribe(CHANNEL);
    this.logger.log(`Cache invalidation bus subscribed (node ${this.nodeId})`);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([this.subscriber?.quit(), this.publisher?.quit()]);
    this.subscriber = null;
    this.publisher = null;
  }

  /** Broadcast an invalidation. No-op when REDIS_URL was not set. */
  publish(msg: InvalidationMessage): void {
    if (!this.publisher) return;
    const payload = JSON.stringify({ ...msg, nodeId: this.nodeId });
    // Fire-and-forget — pub/sub send latency is tiny and a failed publish
    // shouldn't block the write path. We log on rejection so it's visible.
    this.publisher.publish(CHANNEL, payload).catch((err) => {
      this.logger.warn(`Cache invalidation publish failed: ${String(err)}`);
    });
  }

  /** Test-only — number of active Redis connections (publisher + subscriber). */
  isConnected(): boolean {
    return Boolean(this.publisher && this.subscriber);
  }
}
