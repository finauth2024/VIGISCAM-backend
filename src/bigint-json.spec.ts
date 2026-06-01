/**
 * BigInt → JSON shim is wired in main.ts before NestFactory.create. This
 * test pins the behaviour so a future refactor can't silently drop it
 * and re-introduce the "API returns null bodies on scamhold/check" bug.
 */
import './common/json/bigint-shim';

describe('BigInt JSON serialization', () => {
  it('serializes a bare bigint to a string', () => {
    expect(JSON.stringify(123n)).toBe('"123"');
  });

  it('serializes nested bigints inside an object', () => {
    const body = { id: 'x', amountMinor: 9_999_999_999n };
    expect(JSON.parse(JSON.stringify(body))).toEqual({
      id: 'x',
      amountMinor: '9999999999',
    });
  });

  it('survives bigints larger than Number.MAX_SAFE_INTEGER', () => {
    const huge = 9_007_199_254_740_993n; // Number.MAX_SAFE_INTEGER + 2
    expect(JSON.parse(JSON.stringify({ v: huge })).v).toBe('9007199254740993');
  });
});
