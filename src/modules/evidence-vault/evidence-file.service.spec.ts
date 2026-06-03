import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EvidenceFileService } from './evidence-file.service';

function makePrisma(
  opts: {
    event?: { id: string; tenantId: string | null; eventType?: string; occurredAt?: Date } | null;
    existingFiles?: Array<Record<string, unknown>>;
    fileRow?: Record<string, unknown> | null;
  } = {},
) {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  let nextId = 1;
  return {
    raw: {
      evidenceEvent: {
        findUnique: jest.fn(async () =>
          opts.event
            ? {
                id: opts.event.id,
                tenantId: opts.event.tenantId,
                eventType: opts.event.eventType ?? 'TEST_EVENT',
                occurredAt: opts.event.occurredAt ?? new Date('2026-01-01T00:00:00Z'),
              }
            : null,
        ),
      },
      evidenceFile: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `file-${nextId++}`,
            uploadedAt: new Date('2026-01-01T00:00:01Z'),
            retentionUntil: data.retentionUntil ?? null,
            legalHold: data.legalHold ?? false,
            ...data,
          };
          created.push(row);
          return row;
        }),
        findMany: jest.fn(async () => opts.existingFiles ?? []),
        findUnique: jest.fn(async () => opts.fileRow ?? null),
        update: jest.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
          updated.push(args);
          return { ...(opts.fileRow ?? {}), ...args.data };
        }),
      },
    } as never,
    created,
    updated,
  };
}

function makeBlob(
  opts: { uploadResult?: { blobUri: string; sha256: string } | null; readUrl?: string | null } = {},
) {
  const uploads: Array<Record<string, unknown>> = [];
  const reads: Array<Record<string, unknown>> = [];
  return {
    raw: {
      upload: jest.fn(async (input: Record<string, unknown>) => {
        uploads.push(input);
        return opts.uploadResult === undefined
          ? { blobUri: 'https://example.blob/test', sha256: 'srv-sha' }
          : opts.uploadResult;
      }),
      generateReadUrl: jest.fn(async (input: Record<string, unknown>) => {
        reads.push(input);
        return opts.readUrl === undefined ? 'https://example.blob/test?sig=abc' : opts.readUrl;
      }),
    } as never,
    uploads,
    reads,
  };
}

function makeEvidence() {
  const appended: Array<Record<string, unknown>> = [];
  let i = 1;
  return {
    raw: {
      append: jest.fn(async (input: Record<string, unknown>) => {
        const row = { id: `ev-${i++}`, ...input };
        appended.push(row);
        return row;
      }),
    } as never,
    appended,
  };
}

const USER = {
  userId: 'user-1',
  email: 'u@example.com',
  tenantId: 'tenant-A',
  role: 'INDIVIDUAL',
} as never;

const FILE = {
  originalname: 'screenshot.png',
  mimetype: 'image/png',
  buffer: Buffer.from('hello world'),
  size: 11,
};

function makeQueue() {
  return { raw: { enqueue: jest.fn(async () => null) } as never };
}

describe('EvidenceFileService.upload', () => {
  it('rejects with NotFound when the evidence event does not exist', async () => {
    const svc = new EvidenceFileService(
      makePrisma({ event: null }).raw,
      makeBlob().raw,
      makeEvidence().raw,
      makeQueue().raw,
    );
    await expect(svc.upload(USER, 'no-such-event', FILE)).rejects.toThrow(NotFoundException);
  });

  it('rejects with Forbidden when the event belongs to another tenant', async () => {
    const svc = new EvidenceFileService(
      makePrisma({ event: { id: 'ev-1', tenantId: 'tenant-B' } }).raw,
      makeBlob().raw,
      makeEvidence().raw,
      makeQueue().raw,
    );
    await expect(svc.upload(USER, 'ev-1', FILE)).rejects.toThrow(ForbiddenException);
  });

  it('uploads to blob, persists the row, and writes a chain-of-custody event', async () => {
    const prisma = makePrisma({ event: { id: 'ev-1', tenantId: 'tenant-A' } });
    const blob = makeBlob();
    const evidence = makeEvidence();
    const svc = new EvidenceFileService(prisma.raw, blob.raw, evidence.raw, makeQueue().raw);

    const row = await svc.upload(USER, 'ev-1', FILE, {
      legalHold: true,
      metadata: { source: 'browser' },
    });

    expect(blob.uploads).toHaveLength(1);
    expect(blob.uploads[0]).toMatchObject({
      tenantId: 'tenant-A',
      evidenceEventId: 'ev-1',
      filename: 'screenshot.png',
      contentType: 'image/png',
    });
    expect(prisma.created[0]).toMatchObject({
      evidenceEventId: 'ev-1',
      tenantId: 'tenant-A',
      filename: 'screenshot.png',
      mimeType: 'image/png',
      blobUri: 'https://example.blob/test',
      legalHold: true,
    });
    // sha256 is computed locally from the buffer.
    expect(prisma.created[0].sha256).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'EVIDENCE_FILE_UPLOADED',
      entityType: 'EVIDENCE_FILE',
      tenantId: 'tenant-A',
    });
    expect(row.id).toBe('file-1');
  });

  it('falls back to a stub blobUri when BlobService is unconfigured', async () => {
    const prisma = makePrisma({ event: { id: 'ev-1', tenantId: 'tenant-A' } });
    const blob = makeBlob({ uploadResult: null });
    const svc = new EvidenceFileService(prisma.raw, blob.raw, makeEvidence().raw, makeQueue().raw);
    await svc.upload(USER, 'ev-1', FILE);
    expect(String(prisma.created[0].blobUri)).toContain('blob://stub/ev-1/screenshot.png');
  });
});

describe('EvidenceFileService.generateShareLinks', () => {
  it('returns a signed URL per file and writes one EVIDENCE_FILE_SHARED event', async () => {
    const prisma = makePrisma({
      event: { id: 'ev-1', tenantId: 'tenant-A' },
      existingFiles: [
        { id: 'file-1', filename: 'a.png' },
        { id: 'file-2', filename: 'b.png' },
      ],
    });
    const blob = makeBlob();
    const evidence = makeEvidence();
    const svc = new EvidenceFileService(prisma.raw, blob.raw, evidence.raw, makeQueue().raw);

    const out = await svc.generateShareLinks(USER, 'ev-1', { expiresInSeconds: 600 });

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ fileId: 'file-1', filename: 'a.png' });
    expect(blob.reads).toHaveLength(2);
    expect(blob.reads[0]).toMatchObject({ expiresInSeconds: 600 });
    expect(evidence.appended).toHaveLength(1);
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'EVIDENCE_FILE_SHARED',
    });
  });

  it('throws NotFound when a specific fileId does not exist on the event', async () => {
    const svc = new EvidenceFileService(
      makePrisma({
        event: { id: 'ev-1', tenantId: 'tenant-A' },
        existingFiles: [],
      }).raw,
      makeBlob().raw,
      makeEvidence().raw,
      makeQueue().raw,
    );
    await expect(
      svc.generateShareLinks(USER, 'ev-1', { fileId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('EvidenceFileService.exportBundle', () => {
  it('returns a manifest with signed URLs and writes an EVIDENCE_BUNDLE_EXPORTED event', async () => {
    const prisma = makePrisma({
      event: { id: 'ev-1', tenantId: 'tenant-A', eventType: 'INCIDENT_REPORTED' },
      existingFiles: [
        {
          id: 'file-1',
          filename: 'a.pdf',
          mimeType: 'application/pdf',
          sizeBytes: BigInt(1024),
          sha256: 'aaa',
          legalHold: false,
          retentionUntil: null,
          uploadedAt: new Date('2026-01-02T00:00:00Z'),
        },
      ],
    });
    const blob = makeBlob();
    const evidence = makeEvidence();
    const svc = new EvidenceFileService(prisma.raw, blob.raw, evidence.raw, makeQueue().raw);

    const out = await svc.exportBundle(USER, 'ev-1');

    expect(out.event.eventType).toBe('INCIDENT_REPORTED');
    expect(out.files).toHaveLength(1);
    expect(out.files[0]).toMatchObject({
      id: 'file-1',
      sizeBytes: '1024',
      sha256: 'aaa',
      url: 'https://example.blob/test?sig=abc',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'EVIDENCE_BUNDLE_EXPORTED',
    });
  });
});

describe('EvidenceFileService.publicSafeView', () => {
  it('omits blobUri and URLs from the returned files', async () => {
    const prisma = makePrisma({
      event: { id: 'ev-1', tenantId: 'tenant-A' },
      existingFiles: [
        {
          id: 'file-1',
          filename: 'a.pdf',
          mimeType: 'application/pdf',
          sizeBytes: BigInt(2048),
          uploadedAt: new Date('2026-01-03T00:00:00Z'),
          blobUri: 'SECRET',
          sha256: 'SECRET',
        },
      ],
    });
    const blob = makeBlob();
    const svc = new EvidenceFileService(prisma.raw, blob.raw, makeEvidence().raw, makeQueue().raw);

    const out = await svc.publicSafeView(USER, 'ev-1');

    expect(blob.reads).toHaveLength(0); // public-safe never signs URLs
    expect(out.files[0]).toEqual({
      id: 'file-1',
      filename: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: '2048',
      uploadedAt: new Date('2026-01-03T00:00:00Z'),
    });
    expect(JSON.stringify(out)).not.toContain('SECRET');
  });
});

describe('EvidenceFileService.setLegalHold', () => {
  it('throws NotFound when the file does not exist', async () => {
    const svc = new EvidenceFileService(
      makePrisma({ fileRow: null }).raw,
      makeBlob().raw,
      makeEvidence().raw,
      makeQueue().raw,
    );
    await expect(svc.setLegalHold(USER, 'nope', true)).rejects.toThrow(NotFoundException);
  });

  it('throws Forbidden when the file is owned by another tenant', async () => {
    const svc = new EvidenceFileService(
      makePrisma({
        fileRow: { id: 'file-1', tenantId: 'tenant-B', legalHold: false, filename: 'x' },
      }).raw,
      makeBlob().raw,
      makeEvidence().raw,
      makeQueue().raw,
    );
    await expect(svc.setLegalHold(USER, 'file-1', true)).rejects.toThrow(ForbiddenException);
  });

  it('throws BadRequest when the hold is already in the requested state', async () => {
    const svc = new EvidenceFileService(
      makePrisma({
        fileRow: { id: 'file-1', tenantId: 'tenant-A', legalHold: true, filename: 'x' },
      }).raw,
      makeBlob().raw,
      makeEvidence().raw,
      makeQueue().raw,
    );
    await expect(svc.setLegalHold(USER, 'file-1', true)).rejects.toThrow(BadRequestException);
  });

  it('flips the flag and writes a LEGAL_HOLD_SET evidence event', async () => {
    const prisma = makePrisma({
      fileRow: { id: 'file-1', tenantId: 'tenant-A', legalHold: false, filename: 'x' },
    });
    const evidence = makeEvidence();
    const svc = new EvidenceFileService(prisma.raw, makeBlob().raw, evidence.raw, makeQueue().raw);
    await svc.setLegalHold(USER, 'file-1', true);
    expect(prisma.updated[0].data).toEqual({ legalHold: true });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'EVIDENCE_FILE_LEGAL_HOLD_SET',
    });
  });
});

describe('EvidenceFileService.processBundle (CP-11)', () => {
  it('builds a checksummed manifest, persists an EvidenceExportBundle, logs custody', async () => {
    const created: Array<Record<string, unknown>> = [];
    const appended: Array<Record<string, unknown>> = [];
    const prisma = {
      evidenceEvent: {
        findUnique: jest.fn(async () => ({
          id: 'ev-1',
          tenantId: 'tenant-A',
          eventType: 'SCAMHOLD_OPENED',
          occurredAt: new Date('2026-01-01'),
          eventHash: 'abc123',
        })),
      },
      evidenceFile: {
        findMany: jest.fn(async () => [
          {
            id: 'file-1',
            filename: 'shot.png',
            mimeType: 'image/png',
            sizeBytes: 11n,
            sha256: 'f'.repeat(64),
            uploadedAt: new Date('2026-01-01'),
          },
        ]),
      },
      evidenceExportBundle: {
        create: jest.fn(async (args: { data: Record<string, unknown> }) => {
          const row = { id: 'bundle-1', ...args.data };
          created.push(row);
          return row;
        }),
      },
    } as never;
    const evidence = { append: jest.fn(async (i: Record<string, unknown>) => { appended.push(i); return { id: 'e-1' }; }) } as never;
    const svc = new EvidenceFileService(prisma, makeBlob().raw, evidence, makeQueue().raw);

    const bundle = await svc.processBundle('ev-1', 'tenant-A', 'user-1');

    expect(bundle.id).toBe('bundle-1');
    expect(created[0]).toMatchObject({ tenantId: 'tenant-A', recordCount: 1, status: 'READY' });
    expect(created[0].checksum).toMatch(/^[0-9a-f]{64}$/);
    expect((created[0].bundle as { kind: string }).kind).toBe('VIGISCAM_EVIDENCE_BUNDLE');
    expect(appended[0]).toMatchObject({ eventType: 'EVIDENCE_BUNDLE_PERSISTED' });
  });
});
