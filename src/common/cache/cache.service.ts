import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheInvalidationBus } from './cache-invalidation-bus';

/**
 * Per-node in-process TTL cache + cross-process invalidation broadcast.
 *
 * Hot reads stay synchronous (an in-process Map keyed by string). Mutations
 * (`delete`, `deletePrefix`) update the local Map AND publish an
 * invalidation message on Redis pub/sub so every other node drops the
 * matching keys. See `cache-invalidation-bus.ts` for the rationale.
 *
 * Configure via env var `REDIS_URL`. Without it, the bus runs in
 * single-process mode — invalidation still works locally; just isn't
 * broadcast. Local-dev and unit tests need no Redis.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly maxEntries = 1_000;
  private readonly bus: CacheInvalidationBus;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const redisUrl = config.get<string>('REDIS_URL');
    this.bus = new CacheInvalidationBus(redisUrl, (msg) => {
      if (msg.op === 'delete') {
        this.store.delete(msg.key);
      } else {
        this.applyDeletePrefix(msg.prefix);
      }
    });
  }

  async onModuleInit(): Promise<void> {
    await this.bus.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.bus.stop();
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
    this.bus.publish({ op: 'delete', key });
  }

  /** Delete every key matching a prefix — broadcasts to other nodes. */
  deletePrefix(prefix: string): number {
    const removed = this.applyDeletePrefix(prefix);
    this.bus.publish({ op: 'deletePrefix', prefix });
    return removed;
  }

  clear(): void {
    this.store.clear();
  }

  /** Local-only prefix sweep — used by both the local API and the bus listener. */
  private applyDeletePrefix(prefix: string): number {
    let removed = 0;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
        removed++;
      }
    }
    return removed;
  }
}
