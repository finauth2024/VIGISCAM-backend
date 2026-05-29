# Generated API types

`api-types.ts` is produced by `npm run openapi:types` from the live OpenAPI
spec exported by `scripts/export-openapi.ts`. Do **not** edit it by hand —
re-run the script after any controller / DTO change.

Consumed by:
- `test/contract/**` — typed smoke tests that hit the deployed API
- `.github/workflows/openapi-diff.yml` — schema-diff CI gate

If you see drift between this file and the controllers, the source of truth
is the controllers — re-export and commit the regenerated file.
