import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TrustedContactReviewService } from './trusted-contact-review.service';

function makePrisma(opts: {
  contact?: Record<string, unknown> | null;
  existing?: Record<string, unknown> | null;
}) {
  const created: Array<Record<string, unknown>> = [];
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  let nextId = 1;
  let row = opts.existing ?? null;
  return {
    raw: {
      trustedContact: {
        findFirst: jest.fn(async () => opts.contact ?? null),
      },
      trustedContactReview: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const r = {
            id: `tcr-${nextId++}`,
            status: 'PENDING',
            ...data,
          };
          created.push(r);
          row = r;
          return r;
        }),
        findUnique: jest.fn(async () => row),
        findFirst: jest.fn(async () => row),
        findMany: jest.fn(async () => []),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push(args);
          row = { ...(row ?? {}), ...args.data };
          return row;
        }),
      },
    } as never,
    created,
    updates,
    get row() {
      return row;
    },
  };
}

function makeEvidence() {
  const appended: Array<Record<string, unknown>> = [];
  let i = 1;
  return {
    raw: {
      append: jest.fn(async (input: Record<string, unknown>) => {
        const r = { id: `ev-${i++}`, ...input };
        appended.push(r);
        return r;
      }),
    } as never,
    appended,
  };
}

function makeNotifications() {
  const sent: Array<Record<string, unknown>> = [];
  return {
    raw: {
      send: jest.fn(async (input: Record<string, unknown>) => {
        sent.push(input);
        return { deliveryId: `dlv-${sent.length}` };
      }),
    } as never,
    sent,
  };
}

const USER = {
  userId: 'user-1',
  email: 'u@example.com',
  tenantId: 'tenant-A',
  role: 'INDIVIDUAL',
} as never;

describe('TrustedContactReviewService.requestReview', () => {
  it('returns null when the user has no eligible contact', async () => {
    const svc = new TrustedContactReviewService(
      makePrisma({ contact: null }).raw,
      makeEvidence().raw,
      makeNotifications().raw,
    );
    const out = await svc.requestReview({
      user: USER,
      triggerModule: 'SCAMHOLD',
      triggerEventId: 'hold-1',
      triggerSummary: 'Crypto transfer flagged as CRITICAL risk',
    });
    expect(out).toBeNull();
  });

  it('creates a PENDING review, writes evidence, and notifies via email + sms', async () => {
    const prisma = makePrisma({
      contact: {
        id: 'contact-1',
        userId: 'user-1',
        fullName: 'Alex Friend',
        email: 'alex@example.com',
        phone: '+15551234567',
      },
    });
    const evidence = makeEvidence();
    const notifications = makeNotifications();
    const svc = new TrustedContactReviewService(prisma.raw, evidence.raw, notifications.raw);

    const out = await svc.requestReview({
      user: USER,
      triggerModule: 'CLAIMVERIFY',
      triggerEventId: 'claim-1',
      triggerSummary: 'Romance investment claim flagged as CRITICAL',
    });

    expect(out).toBeTruthy();
    expect(prisma.created[0]).toMatchObject({
      userId: 'user-1',
      contactId: 'contact-1',
      triggerModule: 'CLAIMVERIFY',
      triggerEventId: 'claim-1',
    });
    // One-time token is set on the created row.
    expect(typeof prisma.created[0].decidedByContactToken).toBe('string');
    // Evidence event for the request.
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'TRUSTED_CONTACT_REVIEW_REQUESTED',
      entityType: 'TRUSTED_CONTACT_REVIEW',
    });
    // Both channels attempted.
    const channels = notifications.sent.map((n) => n.channel);
    expect(channels).toEqual(['EMAIL', 'SMS']);
  });

  it('skips SMS when the contact has no phone', async () => {
    const notifications = makeNotifications();
    const svc = new TrustedContactReviewService(
      makePrisma({
        contact: {
          id: 'contact-1',
          userId: 'user-1',
          fullName: 'Email-only Contact',
          email: 'alex@example.com',
          phone: null,
        },
      }).raw,
      makeEvidence().raw,
      notifications.raw,
    );

    await svc.requestReview({
      user: USER,
      triggerModule: 'WALLETGUARD',
      triggerEventId: 'check-1',
      triggerSummary: 'Suspicious wallet attempt',
    });

    expect(notifications.sent.map((n) => n.channel)).toEqual(['EMAIL']);
  });
});

describe('TrustedContactReviewService.decide', () => {
  it('throws NotFound for an unknown review id', async () => {
    const svc = new TrustedContactReviewService(
      makePrisma({ existing: null }).raw,
      makeEvidence().raw,
      makeNotifications().raw,
    );
    await expect(svc.decide('nope', { decision: 'APPROVE_AFTER_VERIFICATION' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequest when the review is already decided', async () => {
    const svc = new TrustedContactReviewService(
      makePrisma({
        existing: {
          id: 'tcr-1',
          status: 'DECIDED',
          decidedByContactToken: null,
          userId: 'user-1',
          tenantId: 'tenant-A',
          triggerModule: 'SCAMHOLD',
        },
      }).raw,
      makeEvidence().raw,
      makeNotifications().raw,
    );
    await expect(
      svc.decide('tcr-1', {
        decision: 'APPROVE_AFTER_VERIFICATION',
        caller: USER,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a token-less call from a non-owner', async () => {
    const svc = new TrustedContactReviewService(
      makePrisma({
        existing: {
          id: 'tcr-1',
          status: 'PENDING',
          decidedByContactToken: 'real-token',
          userId: 'user-1',
          tenantId: 'tenant-A',
          triggerModule: 'SCAMHOLD',
        },
      }).raw,
      makeEvidence().raw,
      makeNotifications().raw,
    );
    await expect(
      svc.decide('tcr-1', {
        decision: 'REJECT_HIGH_RISK',
        caller: { userId: 'someone-else', tenantId: 't', role: 'INDIVIDUAL' } as never,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a decision from the protected user themselves', async () => {
    const prisma = makePrisma({
      existing: {
        id: 'tcr-1',
        status: 'PENDING',
        decidedByContactToken: 'real-token',
        userId: 'user-1',
        tenantId: 'tenant-A',
        triggerModule: 'SCAMHOLD',
      },
    });
    const evidence = makeEvidence();
    const svc = new TrustedContactReviewService(prisma.raw, evidence.raw, makeNotifications().raw);
    await svc.decide('tcr-1', {
      decision: 'APPROVE_AFTER_VERIFICATION',
      notes: 'verified the recipient identity',
      caller: USER,
    });
    expect(prisma.updates[0].data).toMatchObject({
      status: 'DECIDED',
      decision: 'APPROVE_AFTER_VERIFICATION',
      // Token is burned after use.
      decidedByContactToken: null,
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'TRUSTED_CONTACT_REVIEW_APPROVE_AFTER_VERIFICATION',
    });
  });

  it('accepts a decision from an external contact via matching token', async () => {
    const prisma = makePrisma({
      existing: {
        id: 'tcr-1',
        status: 'PENDING',
        decidedByContactToken: 'one-time-token',
        userId: 'user-1',
        tenantId: 'tenant-A',
        triggerModule: 'SCAMHOLD',
      },
    });
    const svc = new TrustedContactReviewService(
      prisma.raw,
      makeEvidence().raw,
      makeNotifications().raw,
    );
    await svc.decide('tcr-1', {
      decision: 'REJECT_HIGH_RISK',
      decidedByContactToken: 'one-time-token',
    });
    expect(prisma.updates[0].data).toMatchObject({
      decision: 'REJECT_HIGH_RISK',
      decidedByContactToken: null,
    });
  });
});
