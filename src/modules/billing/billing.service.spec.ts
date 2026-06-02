import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';

function makePrisma(
  opts: {
    subscriptionRow?: Record<string, unknown> | null;
    tenantRow?: Record<string, unknown> | null;
    billingEventRow?: Record<string, unknown> | null;
  } = {},
) {
  const upserts: Array<{ where: unknown; create: unknown; update: unknown }> = [];
  const createdEvents: Array<Record<string, unknown>> = [];
  const updatedEvents: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  let subRow = opts.subscriptionRow ?? null;
  return {
    raw: {
      tenantSubscription: {
        findUnique: jest.fn(async () => subRow),
        upsert: jest.fn(
          async (args: {
            where: unknown;
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            upserts.push(args);
            subRow = { id: 'sub-1', ...(subRow ?? {}), ...args.create, ...args.update };
            return subRow;
          },
        ),
      },
      tenant: {
        findUnique: jest.fn(async () => opts.tenantRow ?? null),
      },
      billingEvent: {
        findUnique: jest.fn(async () => opts.billingEventRow ?? null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const r = { id: 'be-1', ...data };
          createdEvents.push(r);
          return r;
        }),
        update: jest.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
          updatedEvents.push(args);
          return { id: 'be-1', ...args.data };
        }),
      },
    } as never,
    upserts,
    createdEvents,
    updatedEvents,
  };
}

function makeStripe(configured = false) {
  return {
    raw: {
      isConfigured: jest.fn(() => configured),
      ensureCustomer: jest.fn(async () => 'cus_stub_test'),
      createCheckoutSession: jest.fn(async () => ({
        id: 'cs_stub',
        url: 'https://stub.billing.local/checkout',
      })),
      createBillingPortalSession: jest.fn(async () => ({
        url: 'https://stub.billing.local/portal',
      })),
    } as never,
  };
}

function makeEvidence() {
  const appended: Array<Record<string, unknown>> = [];
  return {
    raw: {
      append: jest.fn(async (i: Record<string, unknown>) => {
        appended.push(i);
        return { id: 'ev-1', ...i };
      }),
    } as never,
    appended,
  };
}

function makeConfig(values: Record<string, string> = {}) {
  return {
    raw: {
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
    } as never,
  };
}

const USER = {
  userId: 'user-1',
  email: 'u@corp.example',
  tenantId: 'tenant-A',
  role: 'ENTERPRISE_ADMIN',
} as never;

describe('BillingService.getSubscription', () => {
  it('returns a FREE/INACTIVE default when no row exists', async () => {
    const svc = new BillingService(
      makePrisma({ subscriptionRow: null }).raw,
      makeStripe(false).raw,
      makeEvidence().raw,
      makeConfig().raw,
    );
    const out = await svc.getSubscription('tenant-A');
    expect(out).toMatchObject({ plan: 'FREE', status: 'INACTIVE', stripeConfigured: false });
  });

  it('reflects a stored subscription row', async () => {
    const svc = new BillingService(
      makePrisma({
        subscriptionRow: {
          plan: 'PRO',
          status: 'ACTIVE',
          stripeCustomerId: 'cus_x',
          manualInvoice: false,
        },
      }).raw,
      makeStripe(true).raw,
      makeEvidence().raw,
      makeConfig().raw,
    );
    const out = await svc.getSubscription('tenant-A');
    expect(out).toMatchObject({ plan: 'PRO', status: 'ACTIVE', stripeConfigured: true });
  });
});

describe('BillingService.resolveEffectivePlan', () => {
  it('returns FREE when there is no subscription', async () => {
    const svc = new BillingService(
      makePrisma({ subscriptionRow: null }).raw,
      makeStripe().raw,
      makeEvidence().raw,
      makeConfig().raw,
    );
    expect(await svc.resolveEffectivePlan('tenant-A')).toBe('FREE');
  });

  it('returns FREE when the plan is set but the status is not entitled', async () => {
    const svc = new BillingService(
      makePrisma({ subscriptionRow: { plan: 'PRO', status: 'PAST_DUE' } }).raw,
      makeStripe().raw,
      makeEvidence().raw,
      makeConfig().raw,
    );
    expect(await svc.resolveEffectivePlan('tenant-A')).toBe('FREE');
  });

  it('returns the plan when the status is entitled', async () => {
    const svc = new BillingService(
      makePrisma({ subscriptionRow: { plan: 'ENTERPRISE', status: 'MANUAL' } }).raw,
      makeStripe().raw,
      makeEvidence().raw,
      makeConfig().raw,
    );
    expect(await svc.resolveEffectivePlan('tenant-A')).toBe('ENTERPRISE');
  });
});

describe('BillingService.startCheckout', () => {
  it('rejects the FREE plan', async () => {
    const svc = new BillingService(
      makePrisma().raw,
      makeStripe(false).raw,
      makeEvidence().raw,
      makeConfig().raw,
    );
    await expect(svc.startCheckout(USER, { plan: 'FREE' } as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects PRO in live mode when no price id is configured', async () => {
    const svc = new BillingService(
      makePrisma().raw,
      makeStripe(true).raw, // configured
      makeEvidence().raw,
      makeConfig({}).raw, // no STRIPE_PRICE_PRO
    );
    await expect(svc.startCheckout(USER, { plan: 'PRO' } as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns a checkout url in stub mode + writes a CHECKOUT_STARTED event', async () => {
    const prisma = makePrisma();
    const evidence = makeEvidence();
    const svc = new BillingService(
      prisma.raw,
      makeStripe(false).raw,
      evidence.raw,
      makeConfig().raw,
    );
    const out = await svc.startCheckout(USER, { plan: 'PRO' } as never);
    expect(out.checkoutUrl).toContain('stub.billing.local');
    expect(prisma.upserts.length).toBeGreaterThanOrEqual(1);
    expect(evidence.appended[0]).toMatchObject({ eventType: 'BILLING_CHECKOUT_STARTED' });
  });
});

describe('BillingService.setManualInvoice', () => {
  it('rejects an unknown tenant', async () => {
    const svc = new BillingService(
      makePrisma({ tenantRow: null }).raw,
      makeStripe().raw,
      makeEvidence().raw,
      makeConfig().raw,
    );
    await expect(
      svc.setManualInvoice(USER, 'tenant-X', { plan: 'ENTERPRISE' } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('upserts a MANUAL subscription + writes a MANUAL_INVOICE_SET event', async () => {
    const prisma = makePrisma({ tenantRow: { id: 'tenant-A', name: 'Acme' } });
    const evidence = makeEvidence();
    const svc = new BillingService(prisma.raw, makeStripe().raw, evidence.raw, makeConfig().raw);
    await svc.setManualInvoice(USER, 'tenant-A', { plan: 'ENTERPRISE', note: 'PO-123' } as never);
    expect(prisma.upserts[0].create).toMatchObject({
      plan: 'ENTERPRISE',
      status: 'MANUAL',
      manualInvoice: true,
    });
    expect(evidence.appended[0]).toMatchObject({ eventType: 'BILLING_MANUAL_INVOICE_SET' });
  });
});

describe('BillingService.handleWebhook', () => {
  it('short-circuits a redelivered (already-processed) event', async () => {
    const prisma = makePrisma({
      billingEventRow: { id: 'be-1', stripeEventId: 'evt_1', processedAt: new Date() },
    });
    const svc = new BillingService(
      prisma.raw,
      makeStripe().raw,
      makeEvidence().raw,
      makeConfig().raw,
    );
    const out = await svc.handleWebhook({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: { object: {} },
    } as never);
    expect(out).toEqual({ received: true, deduped: true });
  });

  it('processes checkout.session.completed → ACTIVE subscription', async () => {
    const prisma = makePrisma();
    const svc = new BillingService(
      prisma.raw,
      makeStripe().raw,
      makeEvidence().raw,
      makeConfig().raw,
    );
    const out = await svc.handleWebhook({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { tenantId: 'tenant-A' },
          customer: 'cus_x',
          subscription: 'sub_x',
        },
      },
    } as never);
    expect(out).toEqual({ received: true, deduped: false });
    expect(prisma.upserts[0].update).toMatchObject({ status: 'ACTIVE', stripeCustomerId: 'cus_x' });
  });

  it('processes customer.subscription.deleted → CANCELED + FREE', async () => {
    const prisma = makePrisma();
    const svc = new BillingService(
      prisma.raw,
      makeStripe().raw,
      makeEvidence().raw,
      makeConfig().raw,
    );
    await svc.handleWebhook({
      id: 'evt_3',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_x',
          metadata: { tenantId: 'tenant-A' },
          status: 'canceled',
          items: { data: [{ price: { id: 'price_x' } }] },
          cancel_at_period_end: false,
        },
      },
    } as never);
    expect(prisma.upserts[0].update).toMatchObject({ plan: 'FREE', status: 'CANCELED' });
  });
});
