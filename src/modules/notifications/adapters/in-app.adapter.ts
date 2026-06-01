import { Injectable, Logger } from '@nestjs/common';
import { AlertSeverity } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AdapterResult, ChannelAdapter, NotificationSendArgs } from './adapter.types';

/**
 * In-app notifications. Writes an Alert row that the existing Phase 1
 * AlertsController exposes via `/api/v1/alerts`. No external provider —
 * this channel is always "configured" because the DB is.
 *
 * Recipient is the userId.
 */
@Injectable()
export class InAppAdapter implements ChannelAdapter {
  readonly channel = 'IN_APP' as const;
  private readonly logger = new Logger(InAppAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  isConfigured(): boolean {
    return true;
  }

  async send(args: NotificationSendArgs): Promise<AdapterResult> {
    try {
      const tenantId = args.metadata?.tenantId as string | undefined;
      if (!tenantId) {
        // Alert.tenantId is non-nullable. Callers must pass a tenantId via
        // metadata; missing it is a programming error rather than a
        // transient failure, so we record it and skip the delivery.
        return { ok: false, error: 'in-app alert requires metadata.tenantId' };
      }
      const alert = await this.prisma.alert.create({
        data: {
          userId: args.recipient,
          tenantId,
          type: (args.metadata?.alertType as string) ?? 'GENERIC',
          severity: (args.metadata?.severity as AlertSeverity) ?? 'INFO',
          title: args.subject,
          message: args.body,
        },
      });
      return { ok: true, providerMessageId: alert.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
