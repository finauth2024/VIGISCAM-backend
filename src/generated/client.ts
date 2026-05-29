/**
 * Typed client factory wrapping `openapi-fetch` over the generated types.
 * Used by the contract test suite (test/contract/**) and by any future SDK
 * consumers. Picking the wrong route or enum is now a compile error.
 *
 * Usage:
 *   const api = createApiClient({ baseUrl: 'https://…', token });
 *   const { data, error } = await api.POST('/api/v1/scam-reports', { body: {...} });
 */
import createClient from 'openapi-fetch';
import type { paths } from './api-types';

export interface ApiClientOptions {
  baseUrl: string;
  /** Bearer token for SUPER_ADMIN-protected routes. Optional. */
  token?: string;
  /** Partner API key for X-API-Key routes. Optional. */
  apiKey?: string;
}

export function createApiClient(opts: ApiClientOptions) {
  const headers: Record<string, string> = {};
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.apiKey) headers['X-API-Key'] = opts.apiKey;
  return createClient<paths>({ baseUrl: opts.baseUrl, headers });
}

export type ApiClient = ReturnType<typeof createApiClient>;
