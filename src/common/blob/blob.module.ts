import { Global, Module } from '@nestjs/common';
import { BlobService } from './blob.service';

/**
 * Global so any module (Evidence Vault 10A, ScamMirror 9F, ClaimVerify
 * 9E) can inject BlobService directly. Mirrors the Cache/Queue/Events
 * substrate pattern.
 */
@Global()
@Module({
  providers: [BlobService],
  exports: [BlobService],
})
export class BlobModule {}
