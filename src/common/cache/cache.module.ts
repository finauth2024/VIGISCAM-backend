import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/** Global so any module can inject CacheService without importing this module. */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
