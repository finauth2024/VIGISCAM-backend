/**
 * One-shot bootstrap for the contract-test SUPER_ADMIN.
 *
 * On a fresh DB no admin exists. This script:
 *   1. Registers the contract-test admin via /auth/register (idempotent —
 *      a 409 Conflict is treated as success).
 *   2. Promotes that user to SUPER_ADMIN on the INTERNAL tenant via Prisma
 *      (idempotent via Prisma upsert).
 *
 * Run via `npm run contract:bootstrap-admin`. Env:
 *   - CONTRACT_API_BASE         required, includes /api/v1
 *   - CONTRACT_ADMIN_EMAIL      required
 *   - CONTRACT_ADMIN_PASSWORD   required, ≥10 chars
 *   - DATABASE_URL              required (Prisma connection string)
 */
import { PrismaClient } from '@prisma/client';

const INTERNAL_TENANT_ID = '11111111-1111-4111-8111-111111111111';

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    // eslint-disable-next-line no-console
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const baseUrl = need('CONTRACT_API_BASE');
  const email = need('CONTRACT_ADMIN_EMAIL');
  const password = need('CONTRACT_ADMIN_PASSWORD');
  need('DATABASE_URL');

  // 1. Register (idempotent — 409 if already exists)
  const reg = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName: 'VIGISCAM Contract Admin' }),
  });
  if (reg.status === 201) {
    // eslint-disable-next-line no-console
    console.log(`Registered ${email}`);
  } else if (reg.status === 409) {
    // eslint-disable-next-line no-console
    console.log(`User ${email} already exists — continuing`);
  } else {
    const body = await reg.text();
    throw new Error(`Register failed (${reg.status}): ${body}`);
  }

  // 2. Promote to SUPER_ADMIN on the INTERNAL tenant
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`User ${email} not found after register`);

    await prisma.$transaction(async (tx) => {
      // Demote all other memberships' isPrimary flag so the new one wins.
      await tx.membership.updateMany({
        where: { userId: user.id, tenantId: { not: INTERNAL_TENANT_ID } },
        data: { isPrimary: false },
      });
      await tx.membership.upsert({
        where: {
          userId_tenantId: { userId: user.id, tenantId: INTERNAL_TENANT_ID },
        },
        create: {
          userId: user.id,
          tenantId: INTERNAL_TENANT_ID,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          isPrimary: true,
        },
        update: {
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          isPrimary: true,
        },
      });
    });
    // eslint-disable-next-line no-console
    console.log(`Promoted ${email} to SUPER_ADMIN on the INTERNAL tenant`);
  } finally {
    await prisma.$disconnect();
  }

  // eslint-disable-next-line no-console
  console.log('Bootstrap complete. You can now run `npm run test:contract`.');
}

void main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
