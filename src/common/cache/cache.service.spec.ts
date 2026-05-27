import { CacheService } from './cache.service';

describe('CacheService', () => {
  let cache: CacheService;
  beforeEach(() => {
    cache = new CacheService();
  });

  it('returns null for unknown keys', () => {
    expect(cache.get('nope')).toBeNull();
  });

  it('stores and retrieves a value within the TTL', () => {
    cache.set('k', { hello: 'world' }, 60_000);
    expect(cache.get('k')).toEqual({ hello: 'world' });
  });

  it('expires a value past its TTL', () => {
    cache.set('k', 1, -1); // already expired
    expect(cache.get('k')).toBeNull();
  });

  it('deletePrefix removes every key with the given prefix', () => {
    cache.set('a:1', 1, 60_000);
    cache.set('a:2', 2, 60_000);
    cache.set('b:1', 3, 60_000);
    expect(cache.deletePrefix('a:')).toBe(2);
    expect(cache.get('a:1')).toBeNull();
    expect(cache.get('a:2')).toBeNull();
    expect(cache.get('b:1')).toBe(3);
  });
});
