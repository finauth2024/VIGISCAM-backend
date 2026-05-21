import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../common/prisma/prisma.service';

type CheckStatus = 'up' | 'down';

interface DependencyCheck {
  status: CheckStatus;
  detail?: string;
}

/**
 * Health endpoints for Azure Container Apps / Kubernetes probes.
 *  - /health/live  — liveness: is the process up? (never touches dependencies)
 *  - /health/ready — readiness: are dependencies reachable? (503 if not)
 * Both are exempt from rate limiting.
 */
@ApiTags('Health')
@SkipThrottle()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — the process is running' })
  liveness() {
    return {
      status: 'ok',
      service: 'vigiscam-backend',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — dependencies are reachable' })
  async readiness() {
    const database: DependencyCheck = (await this.prisma.isHealthy())
      ? { status: 'up' }
      : { status: 'down', detail: 'database not reachable' };

    const ready = database.status === 'up';
    const body = {
      status: ready ? 'ok' : 'degraded',
      service: 'vigiscam-backend',
      checks: { database },
      timestamp: new Date().toISOString(),
    };

    if (!ready) {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }
}
