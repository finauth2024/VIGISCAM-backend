import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IntegrationKind } from './dto/create-integration.dto';
import { EnterprisePortalService } from './enterprise-portal.service';

function makePrisma(
  opts: {
    policyRow?: Record<string, unknown> | null;
    devices?: Array<Record<string, unknown>>;
    integrations?: Array<Record<string, unknown>>;
    integrationRow?: Record<string, unknown> | null;
  } = {},
) {
  const upserted: Array<{ where: unknown; create: unknown; update: unknown }> = [];
  const updatedPolicies: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const deletedPolicies: unknown[] = [];
  const createdIntegrations: Array<Record<string, unknown>> = [];
  const updatedIntegrations: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const deletedIntegrations: unknown[] = [];
  let lastPolicy: Record<string, unknown> | null = opts.policyRow ?? null;
  let lastIntegration: Record<string, unknown> | null = opts.integrationRow ?? null;
  return {
    raw: {
      enterprisePolicy: {
        findUnique: jest.fn(async () => opts.policyRow ?? null),
        findMany: jest.fn(async () => (opts.policyRow ? [opts.policyRow] : [])),
        upsert: jest.fn(
          async (args: { where: unknown; create: Record<string, unknown>; update: unknown }) => {
            upserted.push(args);
            lastPolicy = { id: 'pol-1', ...args.create };
            return lastPolicy;
          },
        ),
        update: jest.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
          updatedPolicies.push(args);
          lastPolicy = { ...(lastPolicy ?? {}), ...args.data };
          return lastPolicy;
        }),
        delete: jest.fn(async (args: { where: unknown }) => {
          deletedPolicies.push(args.where);
        }),
      },
      device: {
        findMany: jest.fn(async () => opts.devices ?? []),
      },
      enterpriseIntegration: {
        findMany: jest.fn(async () => opts.integrations ?? []),
        findUnique: jest.fn(async () => opts.integrationRow ?? null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          lastIntegration = { id: 'int-1', ...data };
          createdIntegrations.push(lastIntegration);
          return lastIntegration;
        }),
        update: jest.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
          updatedIntegrations.push(args);
          lastIntegration = { ...(lastIntegration ?? {}), ...args.data };
          return lastIntegration;
        }),
        delete: jest.fn(async (args: { where: unknown }) => {
          deletedIntegrations.push(args.where);
        }),
      },
    } as never,
    upserted,
    updatedPolicies,
    deletedPolicies,
    createdIntegrations,
    updatedIntegrations,
    deletedIntegrations,
  };
}

function makeEvidence() {
  const appended: Array<Record<string, unknown>> = [];
  let i = 1;
  const timeline: Array<Record<string, unknown>> = [{ id: 'ev-prior', tenantId: 'ent-A' }];
  return {
    raw: {
      append: jest.fn(async (input: Record<string, unknown>) => {
        const r = { id: `ev-${i++}`, ...input };
        appended.push(r);
        return r;
      }),
      getTimeline: jest.fn(async () => timeline),
    } as never,
    appended,
    timeline,
  };
}

const ADMIN = {
  userId: 'admin-1',
  email: 'a@corp.example',
  tenantId: 'ent-A',
  role: 'ENTERPRISE_ADMIN',
} as never;

describe('EnterprisePortalService.policies', () => {
  it('setPolicy rejects unknown keys', async () => {
    const svc = new EnterprisePortalService(makePrisma().raw, makeEvidence().raw);
    await expect(svc.setPolicy(ADMIN, 'not-a-key', { value: true })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('setPolicy rejects values that fail registry validation', async () => {
    const svc = new EnterprisePortalService(makePrisma().raw, makeEvidence().raw);
    // guardian_pause_default_seconds rejects 5
    await expect(
      svc.setPolicy(ADMIN, 'guardian_pause_default_seconds', { value: 5 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('setPolicy persists and writes a POLICY_SET evidence event', async () => {
    const prisma = makePrisma();
    const evidence = makeEvidence();
    const svc = new EnterprisePortalService(prisma.raw, evidence.raw);
    await svc.setPolicy(ADMIN, 'elder_mode_default', { value: true });
    expect(prisma.upserted).toHaveLength(1);
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'ENTERPRISE_POLICY_SET',
      tenantId: 'ent-A',
    });
    expect(prisma.updatedPolicies[0].data.evidenceEventId).toBe('ev-1');
  });

  it('getPolicy throws NotFound when no row', async () => {
    const svc = new EnterprisePortalService(
      makePrisma({ policyRow: null }).raw,
      makeEvidence().raw,
    );
    await expect(svc.getPolicy(ADMIN, 'elder_mode_default')).rejects.toThrow(NotFoundException);
  });

  it('deletePolicy clears and writes a POLICY_DELETED evidence event', async () => {
    const prisma = makePrisma({
      policyRow: { id: 'pol-1', tenantId: 'ent-A', key: 'elder_mode_default' },
    });
    const evidence = makeEvidence();
    const svc = new EnterprisePortalService(prisma.raw, evidence.raw);
    await svc.deletePolicy(ADMIN, 'elder_mode_default');
    expect(prisma.deletedPolicies).toHaveLength(1);
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'ENTERPRISE_POLICY_DELETED',
    });
  });
});

describe('EnterprisePortalService.devices', () => {
  it('scopes the device query to my tenant', async () => {
    const prisma = makePrisma({
      devices: [{ id: 'd-1', tenantId: 'ent-A', name: 'laptop' }],
    });
    const svc = new EnterprisePortalService(prisma.raw, makeEvidence().raw);
    await svc.listDevices(ADMIN, {});
    const args = (prisma.raw as never as { device: { findMany: jest.Mock } }).device.findMany.mock
      .calls[0][0];
    expect(args.where.tenantId).toBe('ent-A');
  });
});

describe('EnterprisePortalService.integrations', () => {
  it('createIntegration persists + writes INTEGRATION_CREATED', async () => {
    const prisma = makePrisma();
    const evidence = makeEvidence();
    const svc = new EnterprisePortalService(prisma.raw, evidence.raw);
    await svc.createIntegration(ADMIN, {
      kind: IntegrationKind.SLACK,
      name: 'Trust & Safety channel',
      config: { webhookUrl: 'https://hooks.slack.example/x' },
    });
    expect(prisma.createdIntegrations[0]).toMatchObject({
      tenantId: 'ent-A',
      kind: 'SLACK',
      status: 'ACTIVE',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'ENTERPRISE_INTEGRATION_CREATED',
    });
    expect(prisma.updatedIntegrations[0].data.evidenceEventId).toBe('ev-1');
  });

  it('deleteIntegration rejects cross-tenant rows with NotFound', async () => {
    const svc = new EnterprisePortalService(
      makePrisma({
        integrationRow: { id: 'int-1', tenantId: 'OTHER', name: 'x', kind: 'WEBHOOK' },
      }).raw,
      makeEvidence().raw,
    );
    await expect(svc.deleteIntegration(ADMIN, 'int-1')).rejects.toThrow(NotFoundException);
  });

  it('deleteIntegration succeeds + writes INTEGRATION_DELETED for own-tenant row', async () => {
    const prisma = makePrisma({
      integrationRow: { id: 'int-1', tenantId: 'ent-A', name: 'x', kind: 'WEBHOOK' },
    });
    const evidence = makeEvidence();
    const svc = new EnterprisePortalService(prisma.raw, evidence.raw);
    await svc.deleteIntegration(ADMIN, 'int-1');
    expect(prisma.deletedIntegrations).toHaveLength(1);
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'ENTERPRISE_INTEGRATION_DELETED',
    });
  });
});

describe('EnterprisePortalService.auditLog + billing', () => {
  it('auditLog delegates to EvidenceService.getTimeline scoped to my tenant', async () => {
    const evidence = makeEvidence();
    const svc = new EnterprisePortalService(makePrisma().raw, evidence.raw);
    await svc.auditLog(ADMIN, { entityType: 'ENTERPRISE_POLICY' });
    const timelineMock = (evidence.raw as unknown as { getTimeline: jest.Mock }).getTimeline;
    expect(timelineMock).toHaveBeenCalledWith('ent-A', {
      entityType: 'ENTERPRISE_POLICY',
      entityId: undefined,
      limit: undefined,
    });
  });

  it('billingSummary returns the 11A read-only stub', () => {
    const svc = new EnterprisePortalService(makePrisma().raw, makeEvidence().raw);
    expect(svc.billingSummary()).toMatchObject({
      providerActive: false,
      plan: 'ENTERPRISE',
      billingPortalUrl: null,
    });
  });
});
