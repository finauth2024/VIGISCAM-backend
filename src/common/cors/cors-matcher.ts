/**
 * Glob-aware CORS origin matcher.
 *
 * `CORS_ORIGINS` is a comma-separated list. Entries are compared exactly,
 * EXCEPT entries containing `*` are matched as globs — a single configuration
 * value like `https://*.vercel.app` matches every Vercel preview URL without
 * the env var needing to be updated per branch.
 *
 * Security note: the glob `*` is intentionally restricted to a single host
 * segment (mapped to `[^.]*` in regex). This blocks the common mistake where
 * `*.vercel.app` would otherwise match a hostile origin like
 * `https://evil.com.vercel.app.attacker.io`.
 */

interface Matcher {
  test(origin: string): boolean;
}

class ExactMatcher implements Matcher {
  constructor(private readonly origin: string) {}
  test(origin: string): boolean {
    return origin === this.origin;
  }
}

class GlobMatcher implements Matcher {
  private readonly re: RegExp;
  constructor(pattern: string) {
    // Escape regex metacharacters except `*`, then convert each `*` to
    // `[^.]*` so the wildcard only matches within one hostname segment.
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    this.re = new RegExp('^' + escaped.replace(/\*/g, '[^.]*') + '$');
  }
  test(origin: string): boolean {
    return this.re.test(origin);
  }
}

export function buildCorsMatchers(patterns: string[]): Matcher[] {
  return patterns.map((p) =>
    p.includes('*') ? new GlobMatcher(p) : new ExactMatcher(p),
  );
}

export function isOriginAllowed(
  matchers: Matcher[],
  origin: string | undefined,
): boolean {
  // Same-origin / non-browser callers (no Origin header) — allow.
  if (!origin) return true;
  return matchers.some((m) => m.test(origin));
}
