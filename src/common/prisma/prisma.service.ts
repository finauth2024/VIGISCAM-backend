import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma database client wrapper.
 *
 * Connection failure at boot is logged but NOT fatal — the process stays up so
 * the liveness probe passes, while the readiness probe reports the database as
 * down until it becomes reachable. This is correct orchestrator behaviour:
 * liveness = "process healthy", readiness = "safe to receive traffic".
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (err) {
      this.logger.error(
        `Database connection failed at boot: ${(err as Error).message}. ` +
          'Process will stay up; readiness probe will report unhealthy until the database is reachable.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Lightweight connectivity check used by the readiness probe. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
