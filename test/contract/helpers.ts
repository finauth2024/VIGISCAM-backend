/**
 * Shared setup for contract specs. Reads env config, logs in, returns a fetch
 * helper bound to the configured base URL + admin token.
 *
 * The contract suite tests the deployed HTTP API directly — we want to catch
 * the kind of bugs the typed SDK can't (auth misconfiguration, deploy not
 * picking up a migration, etc). So this file deliberately uses plain `fetch`
 * rather than the openapi-fetch client. The generated types in
 * `src/generated/api-types.ts` are the canonical contract for SDK consumers
 * and the schema-diff gate; these tests prove the deployed implementation
 * actually matches that contract.
 *
 * Skipping behavior — if CONTRACT_API_BASE is unset, every contract spec
 * skips. That lets `npm run test:contract` be wired into CI without forcing
 * every developer to set up an env locally.
 */
import { PrismaClient } from '@prisma/client';

/** The seeded INTERNAL tenant (migration 0010). Used for partner-key tests. */
export const INTERNAL_TENANT_ID = '11111111-1111-4111-8111-111111111111';

export interface ContractEnv {
  baseUrl: string;
  admin: { email: string; password: string };
  /**
   * Optional Prisma connection string. When present, contract specs that need
   * to seed rows (e.g. the 7D OSINT enrichment) will do so via Prisma instead
   * of skipping. Reuses the same env var Prisma itself uses, so the deploy
   * workflow needs nothing extra — the existing DATABASE_URL secret covers it.
   */
  databaseUrl?: string;
}

export function loadEnv(): ContractEnv | null {
  const baseUrl = process.env.CONTRACT_API_BASE;
  const email = process.env.CONTRACT_ADMIN_EMAIL;
  const password = process.env.CONTRACT_ADMIN_PASSWORD;
  if (!baseUrl || !email || !password) return null;
  return {
    baseUrl,
    admin: { email, password },
    databaseUrl: process.env.DATABASE_URL,
  };
}

export interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  apiKey?: string;
  /** Skip the Authorization header — for public endpoints. */
  anonymous?: boolean;
  /** Override headers (e.g. If-None-Match). */
  extraHeaders?: Record<string, string>;
}

/** A small typed call helper bound to the configured base URL + admin token. */
export class ApiCaller {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async call<T = unknown>(
    path: string,
    opts: CallOptions = {},
  ): Promise<{
    status: number;
    headers: Headers;
    data: T;
  }> {
    const headers: Record<string, string> = { ...(opts.extraHeaders ?? {}) };
    if (!opts.anonymous) headers['Authorization'] = `Bearer ${this.token}`;
    if (opts.apiKey) headers['X-API-Key'] = opts.apiKey;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let data: unknown = undefined;
    if (text.length > 0) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { status: res.status, headers: res.headers, data: data as T };
  }
}

export async function login(env: ContractEnv): Promise<string> {
  const res = await fetch(`${env.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.admin.email, password: env.admin.password }),
  });
  if (!res.ok) {
    throw new Error(`Contract login failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken) throw new Error('Login response missing accessToken');
  return body.accessToken;
}

/**
 * A Prisma client scoped to the contract-test DATABASE_URL. Returns null when
 * no database URL is configured — callers should treat that as "skip the
 * dependent assertion". This replaces a previous psql-shell-out, removing the
 * need for a `psql` binary on the runner and four CONTRACT_PG_* env vars.
 */
let prismaSingleton: PrismaClient | null = null;
export function getContractPrisma(env: ContractEnv): PrismaClient | null {
  if (!env.databaseUrl) return null;
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient({
      datasources: { db: { url: env.databaseUrl } },
    });
  }
  return prismaSingleton;
}

export async function disposeContractPrisma(): Promise<void> {
  if (prismaSingleton) {
    await prismaSingleton.$disconnect();
    prismaSingleton = null;
  }
}

/** A unique indicator value per test run — avoids cross-run collisions. */
export function uniqueDomain(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}.example`;
}
