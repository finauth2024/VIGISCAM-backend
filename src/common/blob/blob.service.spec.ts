import { ConfigService } from '@nestjs/config';
import { BlobService } from './blob.service';

/**
 * Unit tests cover graceful-degradation only. The real upload + signed-URL
 * round-trip belongs in a contract test against Azurite or a live
 * Storage account (deferred to the 10A Evidence Vault contract suite).
 */
describe('BlobService (no env)', () => {
  function makeConfig(overrides: Record<string, string | undefined> = {}) {
    return {
      get: (k: string, fallback?: unknown) => overrides[k] ?? fallback,
    } as unknown as ConfigService;
  }

  it('is unconfigured when neither account nor connection string is set', () => {
    const blob = new BlobService(makeConfig());
    blob.onModuleInit();
    expect(blob.isConfigured()).toBe(false);
  });

  it('upload silently returns null without a container', async () => {
    const blob = new BlobService(makeConfig());
    blob.onModuleInit();
    const result = await blob.upload({
      tenantId: 't',
      evidenceEventId: 'e',
      filename: 'x.pdf',
      contentType: 'application/pdf',
      data: Buffer.from('hello'),
    });
    expect(result).toBeNull();
  });

  it('generateReadUrl silently returns null without a container', async () => {
    const blob = new BlobService(makeConfig());
    blob.onModuleInit();
    const url = await blob.generateReadUrl({
      tenantId: 't',
      evidenceEventId: 'e',
      filename: 'x.pdf',
      expiresInSeconds: 60,
    });
    expect(url).toBeNull();
  });

  it('marks itself configured when only an account is supplied (MI path)', () => {
    const blob = new BlobService(makeConfig({ AZURE_STORAGE_ACCOUNT: 'stvigiscamdev' }));
    blob.onModuleInit();
    expect(blob.isConfigured()).toBe(true);
  });

  it('parses a connection string and is configured', () => {
    // Synthetic connection string — never used to make real requests in tests.
    const cs =
      'DefaultEndpointsProtocol=https;' +
      'AccountName=fake;' +
      'AccountKey=' +
      Buffer.from('not-a-real-key').toString('base64') +
      ';EndpointSuffix=core.windows.net';
    const blob = new BlobService(makeConfig({ AZURE_STORAGE_CONNECTION_STRING: cs }));
    blob.onModuleInit();
    expect(blob.isConfigured()).toBe(true);
  });
});
