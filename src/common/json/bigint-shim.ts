/**
 * Teach JSON.stringify how to serialize a bigint.
 *
 * JSON has no native bigint, so the default behaviour is to throw on any
 * bigint field. Prisma `@db.BigInt` columns
 * (e.g. scamhold_events.amountMinor) would otherwise crash the response
 * serializer mid-request, leaving the client with a `null` body.
 *
 * We serialize as a string to preserve precision past 2^53 — the typed
 * OpenAPI client surfaces the field as `string`, and the frontend parses
 * back to BigInt where needed.
 *
 * Imported for side-effect from main.ts. Isolated here so the unit test
 * (bigint-shim.spec.ts) can load + verify without booting Nest.
 */
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

export const __bigintShimInstalled = true;
