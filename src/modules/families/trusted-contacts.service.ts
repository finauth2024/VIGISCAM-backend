import { Injectable, NotFoundException } from '@nestjs/common';
import { TrustedContact } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTrustedContactDto } from './dto/create-trusted-contact.dto';
import { UpdateTrustedContactDto } from './dto/update-trusted-contact.dto';

/** Trusted contacts are owned by a user; every read/write is user-scoped. */
@Injectable()
export class TrustedContactsService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: AuthenticatedUser, dto: CreateTrustedContactDto): Promise<TrustedContact> {
    return this.prisma.trustedContact.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        fullName: dto.fullName,
        relationship: dto.relationship,
        email: dto.email,
        phone: dto.phone,
        canReceiveAlerts: dto.canReceiveAlerts ?? true,
        canApproveHighRiskActions: dto.canApproveHighRiskActions ?? false,
      },
    });
  }

  list(user: AuthenticatedUser): Promise<TrustedContact[]> {
    return this.prisma.trustedContact.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateTrustedContactDto,
  ): Promise<TrustedContact> {
    await this.requireOwned(user, id);
    return this.prisma.trustedContact.update({ where: { id }, data: { ...dto } });
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    await this.requireOwned(user, id);
    await this.prisma.trustedContact.delete({ where: { id } });
  }

  private async requireOwned(user: AuthenticatedUser, id: string): Promise<TrustedContact> {
    const contact = await this.prisma.trustedContact.findUnique({ where: { id } });
    if (!contact || contact.userId !== user.userId) {
      throw new NotFoundException('Trusted contact not found');
    }
    return contact;
  }
}
