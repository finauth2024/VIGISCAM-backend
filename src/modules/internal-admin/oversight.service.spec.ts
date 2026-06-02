import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OversightModule } from './dto/module-events-query.dto';
import { INTERNAL_TENANT_ID } from './internal.constants';
import { OversightService } from './oversight.service';

function makePrisma(
  opts: {
    tenantRow?: Record<string, unknown> | null;
    moduleRows?: Array<Record<string, unknown>>;
  } = {},
) {
  const updatedTenants: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  // Every count() returns a steadily increasing number so assertions can
  // tell them apart; the exact value doesn't matter for these tests.
  let counter = 0;
  const count = jest.fn(async () => {
    counter += 1;
    return counter;
  });
  const findManySpies: Record<string, jest.Mock> = {};
  const moduleModel = (name: string) => {
    findManySpies[name] = jest.fn(async () => opts.moduleRows ?? [{ id: `${name}-1` }]);
    return { count, findMany: findManySpies[name] };
  };
  return {
    raw: {
      pauseEvent: moduleModel('pauseEvent'),
      scamHoldEvent: moduleModel('scamHoldEvent'),
      giftCardWarning: moduleModel('giftCardWarning'),
      walletCheck: moduleModel('walletCheck'),
      claimVerification: moduleModel('claimVerification'),
      scamMirrorSession: moduleModel('scamMirrorSession'),
      trustedContactReview: moduleModel('trustedContactReview'),
      bankCaseReview: { count },
      tellerAssistScore: { count },
      groomingCheckScore: { count },
      platformModerationDecision: { count },
      investigatorCase: { count },
      enterprisePolicy: { count },
      enterpriseIntegration: { count },
      tenant: {
        findMany: jest.fn(async () => [
          { id: 't-1', name: 'Acme', type: 'BANK', status: 'ACTIVE' },
        ]),
        findUnique: jest.fn(async () => opts.tenantRow ?? null),
        update: jest.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
          updatedTenants.push(args);
          return { ...(opts.tenantRow ?? {}), ...args.data };
        }),
      },
    } as never,
    updatedTenants,
    findManySpies,
  };
}

function makeEvidence() {
  const appended: Array<Record<string, unknown>> = [];
  return {
    raw: {
      append: jest.fn(async (input: Record<string, unknown>) => {
        appended.push(input);
        return { id: 'ev-1', ...input };
      }),
    } as never,
    appended,
  };
}

const SUPER = {
  userId: 'admin-1',
  email: 's@vigiscam.local',
  tenantId: INTERNAL_TENANT_ID,
  role: 'SUPER_ADMIN',
} as never;

describe('OversightService.platformOverview', () => {
  it('aggregates counts across every protection module + role portal', async () => {
    const svc = new OversightService(makePrisma().raw, makeEvidence().raw);
    const out = await svc.platformOverview();
    expect(out.protectionModules).toHaveProperty('guardianPause');
    expect(out.protectionModules).toHaveProperty('trustedContactReview.pending');
    expect(out.rolePortals).toHaveProperty('bankGuard.caseReviews');
    expect(out.rolePortals).toHaveProperty('enterprise.integrations');
    expect(typeof out.generatedAt).toBe('string');
  });
});

describe('OversightService.moduleEvents', () => {
  it('routes GUARDIAN_PAUSE to pauseEvent.findMany', async () => {
    const prisma = makePrisma();
    const svc = new OversightService(prisma.raw, makeEvidence().raw);
    await svc.moduleEvents({ module: OversightModule.GUARDIAN_PAUSE });
    expect(prisma.findManySpies.pauseEvent).toHaveBeenCalled();
  });

  it('routes SCAMHOLD to scamHoldEvent.findMany and honors a tenant filter', async () => {
    const prisma = makePrisma();
    const svc = new OversightService(prisma.raw, makeEvidence().raw);
    await svc.moduleEvents({ module: OversightModule.SCAMHOLD, tenantId: 'tenant-X', limit: 10 });
    const args = prisma.findManySpies.scamHoldEvent.mock.calls[0][0];
    expect(args.where).toEqual({ tenantId: 'tenant-X' });
    expect(args.take).toBe(10);
  });

  it('routes TRUSTED_CONTACT_REVIEW to its model', async () => {
    const prisma = makePrisma();
    const svc = new OversightService(prisma.raw, makeEvidence().raw);
    await svc.moduleEvents({ module: OversightModule.TRUSTED_CONTACT_REVIEW });
    expect(prisma.findManySpies.trustedContactReview).toHaveBeenCalled();
  });
});

describe('OversightService.setTenantStatus', () => {
  it('throws NotFound for an unknown tenant', async () => {
    const svc = new OversightService(makePrisma({ tenantRow: null }).raw, makeEvidence().raw);
    await expect(
      svc.setTenantStatus(SUPER, 't-x', { status: 'SUSPENDED' } as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses to suspend the INTERNAL tenant', async () => {
    const svc = new OversightService(
      makePrisma({
        tenantRow: { id: 'i-1', type: 'INTERNAL', status: 'ACTIVE', name: 'VIGISCAM' },
      }).raw,
      makeEvidence().raw,
    );
    await expect(
      svc.setTenantStatus(SUPER, 'i-1', { status: 'SUSPENDED' } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a no-op status change', async () => {
    const svc = new OversightService(
      makePrisma({
        tenantRow: { id: 't-1', type: 'BANK', status: 'ACTIVE', name: 'Acme' },
      }).raw,
      makeEvidence().raw,
    );
    await expect(svc.setTenantStatus(SUPER, 't-1', { status: 'ACTIVE' } as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('suspends a bank tenant + writes a TENANT_STATUS_CHANGED event to the internal chain', async () => {
    const prisma = makePrisma({
      tenantRow: { id: 't-1', type: 'BANK', status: 'ACTIVE', name: 'Acme' },
    });
    const evidence = makeEvidence();
    const svc = new OversightService(prisma.raw, evidence.raw);
    await svc.setTenantStatus(SUPER, 't-1', {
      status: 'SUSPENDED',
      reason: 'fraud review',
    } as never);
    expect(prisma.updatedTenants[0].data).toEqual({ status: 'SUSPENDED' });
    expect(evidence.appended[0]).toMatchObject({
      tenantId: INTERNAL_TENANT_ID,
      eventType: 'INTERNAL_TENANT_STATUS_CHANGED',
      actorType: 'ADMIN',
    });
    expect((evidence.appended[0].metadata as Record<string, unknown>).reason).toBe('fraud review');
  });
});
