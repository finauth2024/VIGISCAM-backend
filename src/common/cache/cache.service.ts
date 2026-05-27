import { Injectable } from '@nestjs/common';

/**
 * Minimal in-process TTL cache. FIFO-evicted at a fixed max size — adequate
 * for the public-registry read traffic we're shielding the database from at
 * MVP. Production swap to Azure Cache for Redis is a contract-preserving
 * change: replace the Map with an ioredis-backed implementation.
 */
@Injectable()
export class CacheService {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly maxEntries = 1_000;

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
      // Evict oldest insertion — Map preserves insertion order.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Delete every key matching a prefix — useful for write-side invalidation. */
  deletePrefix(prefix: string): number {
    let removed = 0;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.store.clear();
  }
}
