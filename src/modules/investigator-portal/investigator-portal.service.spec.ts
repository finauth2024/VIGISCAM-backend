import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CaseDisposition } from './dto/close-case.dto';
import { CaseSeverity } from './dto/create-case.dto';
import { CaseStatus } from './dto/update-case.dto';
import { InvestigatorPortalService } from './investigator-portal.service';

function makePrisma(
  opts: {
    caseRow?: Record<string, unknown> | null;
    caseRowOnSecondCall?: Record<string, unknown> | null;
    cases?: Array<Record<string, unknown>>;
    evidenceLink?: Record<string, unknown> | null;
    clusterLink?: Record<string, unknown> | null;
    createEvidenceThrows?: { code: string } | null;
    createClusterThrows?: { code: string } | null;
  } = {},
) {
  const createdCases: Array<Record<string, unknown>> = [];
  const updatedCases: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const createdEvidenceLinks: Array<Record<string, unknown>> = [];
  const deletedEvidenceLinks: unknown[] = [];
  const createdClusterLinks: Array<Record<string, unknown>> = [];
  const deletedClusterLinks: unknown[] = [];
  const createdNotes: Array<Record<string, unknown>> = [];
  const updatedNotes: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  let lastCaseRow: Record<string, unknown> | null = opts.caseRow ?? null;
  let lastNoteRow: Record<string, unknown> | null = null;
  let calls = 0;
  return {
    raw: {
      investigatorCase: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          lastCaseRow = { id: 'case-1', ...data };
          createdCases.push(lastCaseRow);
          return lastCaseRow;
        }),
        findMany: jest.fn(async () => opts.cases ?? []),
        findUnique: jest.fn(async () => {
          calls += 1;
          if (calls === 1) return opts.caseRow ?? null;
          return opts.caseRowOnSecondCall ?? opts.caseRow ?? null;
        }),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updatedCases.push(args);
          lastCaseRow = { ...(lastCaseRow ?? {}), ...args.data };
          return lastCaseRow;
        }),
      },
      investigatorCaseEvidence: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (opts.createEvidenceThrows) throw opts.createEvidenceThrows;
          const r = { id: 'ev-link-1', ...data };
          createdEvidenceLinks.push(r);
          return r;
        }),
        findUnique: jest.fn(async () => opts.evidenceLink ?? null),
        delete: jest.fn(async (args: { where: unknown }) => {
          deletedEvidenceLinks.push(args.where);
        }),
      },
      investigatorCaseCluster: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (opts.createClusterThrows) throw opts.createClusterThrows;
          const r = { id: 'cl-link-1', ...data };
          createdClusterLinks.push(r);
          return r;
        }),
        findUnique: jest.fn(async () => opts.clusterLink ?? null),
        delete: jest.fn(async (args: { where: unknown }) => {
          deletedClusterLinks.push(args.where);
        }),
      },
      investigatorCaseNote: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          lastNoteRow = { id: 'note-1', ...data };
          createdNotes.push(lastNoteRow);
          return lastNoteRow;
        }),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updatedNotes.push(args);
          lastNoteRow = { ...(lastNoteRow ?? {}), ...args.data };
          return lastNoteRow;
        }),
      },
    } as never,
    createdCases,
    updatedCases,
    createdEvidenceLinks,
    deletedEvidenceLinks,
    createdClusterLinks,
    deletedClusterLinks,
    createdNotes,
    updatedNotes,
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

const INV = {
  userId: 'inv-1',
  email: 'i@agency.example',
  tenantId: 'agency-tenant-A',
  role: 'INVESTIGATOR',
} as never;

const OPEN_CASE_A = {
  id: 'case-1',
  tenantId: 'agency-tenant-A',
  status: 'OPEN',
};
const CLOSED_CASE_A = {
  id: 'case-1',
  tenantId: 'agency-tenant-A',
  status: 'CLOSED',
};

describe('InvestigatorPortalService.createCase', () => {
  it('persists with my tenant + me as creator, then links the evidence event', async () => {
    const prisma = makePrisma();
    const evidence = makeEvidence();
    const svc = new InvestigatorPortalService(prisma.raw, evidence.raw);
    await svc.createCase(INV, {
      title: 'Operation Mockingbird',
      severity: CaseSeverity.HIGH,
    });
    expect(prisma.createdCases[0]).toMatchObject({
      tenantId: 'agency-tenant-A',
      createdByUserId: 'inv-1',
      title: 'Operation Mockingbird',
      severity: 'HIGH',
      status: 'OPEN',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'INVESTIGATOR_CASE_CREATED',
      tenantId: 'agency-tenant-A',
    });
    expect(prisma.updatedCases[0].data.evidenceEventId).toBe('ev-1');
  });
});

describe('InvestigatorPortalService.getCase', () => {
  it('returns NotFound for cross-tenant cases', async () => {
    const svc = new InvestigatorPortalService(
      makePrisma({
        caseRow: { id: 'case-1', tenantId: 'other-tenant', evidenceLinks: [], clusterLinks: [], notes: [] },
      }).raw,
      makeEvidence().raw,
    );
    await expect(svc.getCase(INV, 'case-1')).rejects.toThrow(NotFoundException);
  });
});

describe('InvestigatorPortalService.updateCase', () => {
  it('rejects when the case is already closed', async () => {
    const svc = new InvestigatorPortalService(
      makePrisma({ caseRow: CLOSED_CASE_A }).raw,
      makeEvidence().raw,
    );
    await expect(
      svc.updateCase(INV, 'case-1', { status: CaseStatus.IN_PROGRESS }),
    ).rejects.toThrow(BadRequestException);
  });

  it('records an INVESTIGATOR_CASE_UPDATED event on success', async () => {
    const prisma = makePrisma({ caseRow: OPEN_CASE_A });
    const evidence = makeEvidence();
    const svc = new InvestigatorPortalService(prisma.raw, evidence.raw);
    await svc.updateCase(INV, 'case-1', { status: CaseStatus.IN_PROGRESS });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'INVESTIGATOR_CASE_UPDATED',
    });
  });
});

describe('InvestigatorPortalService.linkEvidence', () => {
  it('writes EVIDENCE_LINKED on success', async () => {
    const prisma = makePrisma({ caseRow: OPEN_CASE_A });
    const evidence = makeEvidence();
    const svc = new InvestigatorPortalService(prisma.raw, evidence.raw);
    await svc.linkEvidence(INV, 'case-1', {
      entityId: '11111111-1111-1111-1111-111111111111',
      rationale: 'matches the email used in the affidavit',
    });
    expect(prisma.createdEvidenceLinks[0]).toMatchObject({
      caseId: 'case-1',
      evidenceEventId: '11111111-1111-1111-1111-111111111111',
      linkedByUserId: 'inv-1',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'INVESTIGATOR_CASE_EVIDENCE_LINKED',
    });
  });

  it('maps the P2002 unique-violation to BadRequest "already linked"', async () => {
    const svc = new InvestigatorPortalService(
      makePrisma({
        caseRow: OPEN_CASE_A,
        createEvidenceThrows: { code: 'P2002' },
      }).raw,
      makeEvidence().raw,
    );
    await expect(
      svc.linkEvidence(INV, 'case-1', { entityId: '11111111-1111-1111-1111-111111111111' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('InvestigatorPortalService.unlinkEvidence', () => {
  it('rejects when the link does not belong to the case', async () => {
    const svc = new InvestigatorPortalService(
      makePrisma({
        caseRow: OPEN_CASE_A,
        evidenceLink: { id: 'ev-link-1', caseId: 'other-case', evidenceEventId: 'x' },
      }).raw,
      makeEvidence().raw,
    );
    await expect(svc.unlinkEvidence(INV, 'case-1', 'ev-link-1')).rejects.toThrow(NotFoundException);
  });

  it('deletes the link + writes EVIDENCE_UNLINKED', async () => {
    const prisma = makePrisma({
      caseRow: OPEN_CASE_A,
      evidenceLink: { id: 'ev-link-1', caseId: 'case-1', evidenceEventId: 'ev-event-x' },
    });
    const evidence = makeEvidence();
    const svc = new InvestigatorPortalService(prisma.raw, evidence.raw);
    await svc.unlinkEvidence(INV, 'case-1', 'ev-link-1');
    expect(prisma.deletedEvidenceLinks).toHaveLength(1);
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'INVESTIGATOR_CASE_EVIDENCE_UNLINKED',
    });
  });
});

describe('InvestigatorPortalService.linkCluster', () => {
  it('writes CLUSTER_LINKED on success', async () => {
    const prisma = makePrisma({ caseRow: OPEN_CASE_A });
    const evidence = makeEvidence();
    const svc = new InvestigatorPortalService(prisma.raw, evidence.raw);
    await svc.linkCluster(INV, 'case-1', {
      entityId: '22222222-2222-2222-2222-222222222222',
    });
    expect(prisma.createdClusterLinks[0]).toMatchObject({
      caseId: 'case-1',
      clusterId: '22222222-2222-2222-2222-222222222222',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'INVESTIGATOR_CASE_CLUSTER_LINKED',
    });
  });

  it('maps P2002 to "already linked"', async () => {
    const svc = new InvestigatorPortalService(
      makePrisma({
        caseRow: OPEN_CASE_A,
        createClusterThrows: { code: 'P2002' },
      }).raw,
      makeEvidence().raw,
    );
    await expect(
      svc.linkCluster(INV, 'case-1', { entityId: '22222222-2222-2222-2222-222222222222' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('InvestigatorPortalService.addNote', () => {
  it('appends a note + writes NOTE_ADDED + links evidence id back onto the note', async () => {
    const prisma = makePrisma({ caseRow: OPEN_CASE_A });
    const evidence = makeEvidence();
    const svc = new InvestigatorPortalService(prisma.raw, evidence.raw);
    await svc.addNote(INV, 'case-1', { body: 'witness recants' });
    expect(prisma.createdNotes[0]).toMatchObject({
      caseId: 'case-1',
      authorUserId: 'inv-1',
      body: 'witness recants',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'INVESTIGATOR_CASE_NOTE_ADDED',
    });
    expect(prisma.updatedNotes[0].data.evidenceEventId).toBe('ev-1');
  });
});

describe('InvestigatorPortalService.closeCase', () => {
  it('marks the case CLOSED and writes INVESTIGATOR_CASE_CLOSED', async () => {
    const prisma = makePrisma({ caseRow: OPEN_CASE_A });
    const evidence = makeEvidence();
    const svc = new InvestigatorPortalService(prisma.raw, evidence.raw);
    await svc.closeCase(INV, 'case-1', {
      disposition: CaseDisposition.CONFIRMED_SCAM,
      notes: 'wire transfers tied to known mule network',
    });
    expect(prisma.updatedCases[0].data).toMatchObject({
      status: 'CLOSED',
      disposition: 'CONFIRMED_SCAM',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'INVESTIGATOR_CASE_CLOSED',
    });
  });
});
