import { Injectable, NotFoundException } from '@nestjs/common';
import { ModelRegistry, ModelStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterModelDto } from './dto/register-model.dto';

/**
 * CP-7 — the model version registry. Every AI model the platform uses is
 * registered with its version, lifecycle status, and evaluation metrics so each
 * AIDecision traces to a governed model (brief §5/§17/§18, non-negotiable #13).
 * Activating a version retires any other ACTIVE version for the same serviceKind
 * so there is exactly one canonical model per service.
 */
@Injectable()
export class ModelRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  register(user: AuthenticatedUser, dto: RegisterModelDto): Promise<ModelRegistry> {
    return this.prisma.modelRegistry.upsert({
      where: { serviceKind_version: { serviceKind: dto.serviceKind, version: dto.version } },
      create: {
        serviceKind: dto.serviceKind,
        modelName: dto.modelName,
        version: dto.version,
        status: dto.status ?? 'DRAFT',
        source: dto.source ?? 'EXTERNAL',
        metrics: (dto.metrics ?? undefined) as never,
        notes: dto.notes ?? null,
        registeredByUserId: user.userId,
      },
      update: {
        modelName: dto.modelName,
        status: dto.status,
        source: dto.source,
        metrics: (dto.metrics ?? undefined) as never,
        notes: dto.notes,
      },
    });
  }

  list(serviceKind?: string, status?: string): Promise<ModelRegistry[]> {
    const validStatus = (Object.values(ModelStatus) as string[]).includes(status ?? '');
    return this.prisma.modelRegistry.findMany({
      where: {
        ...(serviceKind ? { serviceKind } : {}),
        ...(validStatus ? { status: status as ModelStatus } : {}),
      },
      orderBy: [{ serviceKind: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /** The single ACTIVE model for a service, or null. */
  getActive(serviceKind: string): Promise<ModelRegistry | null> {
    return this.prisma.modelRegistry.findFirst({
      where: { serviceKind, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setStatus(id: string, status: ModelStatus): Promise<ModelRegistry> {
    const model = await this.prisma.modelRegistry.findUnique({ where: { id } });
    if (!model) throw new NotFoundException('Model not found');

    // Promoting to ACTIVE retires the previous active version of this service.
    if (status === 'ACTIVE') {
      await this.prisma.modelRegistry.updateMany({
        where: { serviceKind: model.serviceKind, status: 'ACTIVE', id: { not: id } },
        data: { status: 'RETIRED' },
      });
    }
    return this.prisma.modelRegistry.update({ where: { id }, data: { status } });
  }
}
