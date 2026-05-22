import { Injectable } from '@nestjs/common';
import { IndicatorType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeIndicator } from '../scam-signals/normalization';
import { PublicRegistryEntry, toPublicRegistryEntry } from './registry.mapper';

export interface RegistrySearchQuery {
  q?: string;
  type?: string;
  category?: string;
}

/**
 * Public Scam Intelligence Registry search (PDF §29.2). Returns ONLY entries
 * with status PUBLISHED — never raw reports, private evidence, or unverified
 * allegations. Results are projected through the public-safe mapper.
 */
@Injectable()
export class RegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: RegistrySearchQuery): Promise<PublicRegistryEntry[]> {
    // PUBLISHED is the only publicly visible status — non-negotiable.
    const where: Prisma.RegistryEntryWhereInput = { status: 'PUBLISHED' };

    const type = this.parseType(query.type);
    if (type) {
      where.indicatorType = type;
    }
    if (query.category) {
      where.category = query.category.toUpperCase();
    }

    const q = query.q?.trim();
    if (q) {
      if (type) {
        // Typed search => exact match on the normalized indicator.
        where.normalizedIndicator = normalizeIndicator(type, q);
      } else {
        // Untyped search => case-insensitive partial match.
        where.OR = [
          { normalizedIndicator: { contains: q.toLowerCase() } },
          { indicatorValue: { contains: q, mode: 'insensitive' } },
        ];
      }
    }

    const entries = await this.prisma.registryEntry.findMany({
      where,
      orderBy: { lastSeen: 'desc' },
      take: 50,
    });
    return entries.map(toPublicRegistryEntry);
  }

  private parseType(raw?: string): IndicatorType | undefined {
    if (!raw) {
      return undefined;
    }
    const upper = raw.toUpperCase();
    return (Object.values(IndicatorType) as string[]).includes(upper)
      ? (upper as IndicatorType)
      : undefined;
  }
}
