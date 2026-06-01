-- VIGISCAM Backend — Phase 8E: notification delivery log.
-- Every outbound notification (email/SMS/push/in-app/WebSocket) records an
-- attempt row. Retries fire via the BullMQ notification-delivery queue and
-- append additional rows tied to the same upstream event.

CREATE TYPE "NotificationChannel" AS ENUM (
  'EMAIL',
  'SMS',
  'PUSH',
  'IN_APP',
  'WEBSOCKET'
);

CREATE TYPE "NotificationDeliveryStatus" AS ENUM (
  'PENDING',
  'SENT',
  'FAILED',
  'SKIPPED'
);

CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "userId" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "payloadDigest" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_deliveries_tenantId_idx" ON "notification_deliveries"("tenantId");
CREATE INDEX "notification_deliveries_userId_idx" ON "notification_deliveries"("userId");
CREATE INDEX "notification_deliveries_channel_status_idx" ON "notification_deliveries"("channel", "status");
CREATE INDEX "notification_deliveries_templateKey_idx" ON "notification_deliveries"("templateKey");
