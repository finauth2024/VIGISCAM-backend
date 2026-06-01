import { DefaultAzureCredential } from '@azure/identity';
import {
  BlobSASPermissions,
  BlobServiceClient,
  ContainerClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

/**
 * Azure Blob storage wrapper (Phase 8D).
 *
 * **Tenant isolation by path prefix.** The Bicep template provisions a
 * single `evidence` container. Per-tenant containers would require
 * dynamic Azure ops on every new tenant and don't add a guarantee that
 * a server-enforced path prefix doesn't already give us — every blob
 * URI is `tenant-<id>/<evidenceId>/<filename>`. Cross-tenant access is
 * impossible at the API layer because the prefix is derived from the
 * caller's JWT-resolved tenantId, not from anything client-controlled.
 *
 * **Graceful degradation** — when AZURE_STORAGE_ACCOUNT is unset, every
 * method becomes a no-op that logs a WARN. Same pattern as Cache/Queue
 * substrates: code that depends on Blob compiles + runs in local dev
 * without standing up Azurite or a real account.
 *
 * **Auth.** Two paths, in priority order:
 *   1. AZURE_STORAGE_CONNECTION_STRING — explicit, used in CI and any
 *      environment without managed identity.
 *   2. AZURE_STORAGE_ACCOUNT alone — uses DefaultAzureCredential
 *      (managed identity in the Container App; az login locally).
 *
 * SAS URLs are signed with the shared-key credential; when only managed
 * identity is configured, SAS generation falls back to a user-delegation
 * key (added in a follow-up — left as a TODO so 8D ships small).
 */
@Injectable()
export class BlobService implements OnModuleInit {
  private readonly logger = new Logger(BlobService.name);
  private container: ContainerClient | null = null;
  private sharedKeyCred: StorageSharedKeyCredential | null = null;
  private accountName: string | null = null;
  private containerName = 'evidence';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const accountName = this.config.get<string>('AZURE_STORAGE_ACCOUNT');
    const connectionString = this.config.get<string>('AZURE_STORAGE_CONNECTION_STRING');
    this.containerName = this.config.get<string>('AZURE_STORAGE_CONTAINER', 'evidence');

    if (!accountName && !connectionString) {
      this.logger.warn(
        'No Azure Storage env — Blob service is a no-op. ' +
          'Set AZURE_STORAGE_ACCOUNT (+ optional AZURE_STORAGE_CONNECTION_STRING) ' +
          'to enable evidence file uploads.',
      );
      return;
    }

    if (connectionString) {
      const service = BlobServiceClient.fromConnectionString(connectionString);
      this.container = service.getContainerClient(this.containerName);
      // Extract account name + shared-key from the connection string so we
      // can sign SAS URLs locally without an extra round-trip to Azure.
      this.sharedKeyCred = parseSharedKeyFromConnString(connectionString);
      this.accountName = this.sharedKeyCred?.accountName ?? accountName ?? null;
    } else if (accountName) {
      // Managed-identity path — DefaultAzureCredential picks up the
      // Container App's user-assigned identity in Azure, or falls back
      // to `az login` locally. The Bicep template grants this identity
      // the Storage Blob Data Contributor role on the storage account.
      const service = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        new DefaultAzureCredential(),
      );
      this.container = service.getContainerClient(this.containerName);
      this.accountName = accountName;
    }

    this.logger.log(
      `Blob service ready (account=${this.accountName}, container=${this.containerName})`,
    );
  }

  /**
   * Upload a buffer under `tenant-<id>/<evidenceId>/<filename>`. Returns
   * the storage URI + a sha256 hash for chain-of-custody.
   *
   * The caller (Evidence Vault, 10A) records the URI + hash in
   * `evidence_files` so the file is discoverable + verifiable.
   */
  async upload(args: {
    tenantId: string;
    evidenceEventId: string;
    filename: string;
    contentType: string;
    data: Buffer;
  }): Promise<{ blobUri: string; sha256: string } | null> {
    if (!this.container) {
      this.logger.warn(`Blob upload skipped — no container (file=${args.filename})`);
      return null;
    }
    const sha256 = createHash('sha256').update(args.data).digest('hex');
    const blobName = this.blobName(args);
    const block = this.container.getBlockBlobClient(blobName);
    await block.uploadData(args.data, {
      blobHTTPHeaders: { blobContentType: args.contentType },
      metadata: {
        evidenceEventId: args.evidenceEventId,
        sha256,
      },
    });
    return { blobUri: block.url, sha256 };
  }

  /**
   * Time-bound read URL for the given blob. Used by /evidence/:id/share
   * (10A) and the redacted public-safe copy endpoint.
   */
  async generateReadUrl(args: {
    tenantId: string;
    evidenceEventId: string;
    filename: string;
    expiresInSeconds: number;
  }): Promise<string | null> {
    if (!this.container || !this.sharedKeyCred) {
      this.logger.warn('generateReadUrl skipped — managed-identity SAS path is a 10A follow-up.');
      return null;
    }
    const blobName = this.blobName(args);
    const expiresOn = new Date(Date.now() + args.expiresInSeconds * 1000);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        protocol: SASProtocol.Https,
        expiresOn,
      },
      this.sharedKeyCred,
    ).toString();
    const blob = this.container.getBlockBlobClient(blobName);
    return `${blob.url}?${sas}`;
  }

  /** Test/observability. */
  isConfigured(): boolean {
    return this.container !== null;
  }

  private blobName(args: { tenantId: string; evidenceEventId: string; filename: string }): string {
    // Server-derived prefix — caller can't escape the tenant scope.
    return `tenant-${args.tenantId}/${args.evidenceEventId}/${args.filename}`;
  }
}

/**
 * Pull the shared-key credential out of an Azure Storage connection
 * string. Returns null if the string is in the managed-identity or
 * SAS-token form (those don't carry a shared key).
 */
function parseSharedKeyFromConnString(cs: string): StorageSharedKeyCredential | null {
  const parts = Object.fromEntries(
    cs
      .split(';')
      .filter(Boolean)
      .map((kv) => {
        const eq = kv.indexOf('=');
        return [kv.slice(0, eq), kv.slice(eq + 1)] as const;
      }),
  ) as Record<string, string>;
  if (!parts.AccountName || !parts.AccountKey) return null;
  return new StorageSharedKeyCredential(parts.AccountName, parts.AccountKey);
}
