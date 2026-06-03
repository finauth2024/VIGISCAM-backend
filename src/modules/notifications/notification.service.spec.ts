import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { ChannelAdapter } from './adapters/adapter.types';
import { EmailAdapter } from './adapters/email.adapter';
import { InAppAdapter } from './adapters/in-app.adapter';
import { PushAdapter } from './adapters/push.adapter';
import { SmsAdapter } from './adapters/sms.adapter';
import { WebsocketAdapter } from './adapters/websocket.adapter';
import { NotificationService } from './notification.service';

/** Build a single adapter mock + capture each send() call. */
function makeAdapter(
  channel: 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP' | 'WEBSOCKET',
  result: { ok: boolean; skipped?: boolean; providerMessageId?: string; error?: string },
): ChannelAdapter & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    channel,
    isConfigured: () => true,
    send: jest.fn(async (args) => {
      calls.push(args);
      return result;
    }),
    calls,
  };
}

function makePrisma() {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  return {
    raw: {
      notificationDelivery: {
        create: jest.fn(async (args: { data: Record<string, unknown> }) => {
          const row = { id: `delivery-${created.length + 1}`, ...args.data };
          created.push(row);
          return row;
        }),
        update: jest.fn(async (args: { data: Record<string, unknown> }) => {
          updated.push(args.data);
          return {};
        }),
        updateMany: jest.fn(async (args: { data: Record<string, unknown> }) => {
          updated.push(args.data);
          return { count: 1 };
        }),
      },
    } as unknown as PrismaService,
    created,
    updated,
  };
}

function buildSvc(prisma: ReturnType<typeof makePrisma>, queue: ReturnType<typeof makeQueue>, opts: { emailOk: boolean } = { emailOk: true }) {
  return new NotificationService(
    makeAdapter('EMAIL', opts.emailOk ? { ok: true } : { ok: false, error: 'upstream 500' }) as unknown as EmailAdapter,
    makeAdapter('SMS', { ok: true }) as unknown as SmsAdapter,
    makeAdapter('PUSH', { ok: true }) as unknown as PushAdapter,
    makeAdapter('IN_APP', { ok: true }) as unknown as InAppAdapter,
    makeAdapter('WEBSOCKET', { ok: true }) as unknown as WebsocketAdapter,
    prisma.raw,
    queue.raw,
  );
}

function makeQueue() {
  const enqueued: Array<{ name: string; payload: unknown }> = [];
  return {
    raw: {
      enqueue: jest.fn(async (name: string, payload: unknown) => {
        enqueued.push({ name, payload });
        return 'job-1';
      }),
    } as unknown as QueueService,
    enqueued,
  };
}

describe('NotificationService', () => {
  it('writes a delivery row, calls the EMAIL adapter, marks SENT on success', async () => {
    const email = makeAdapter('EMAIL', { ok: true, providerMessageId: 'sg-1' });
    const prisma = makePrisma();
    const queue = makeQueue();
    const svc = new NotificationService(
      email as unknown as EmailAdapter,
      makeAdapter('SMS', { ok: true }) as unknown as SmsAdapter,
      makeAdapter('PUSH', { ok: true }) as unknown as PushAdapter,
      makeAdapter('IN_APP', { ok: true }) as unknown as InAppAdapter,
      makeAdapter('WEBSOCKET', { ok: true }) as unknown as WebsocketAdapter,
      prisma.raw,
      queue.raw,
    );

    const result = await svc.send({
      channel: 'EMAIL',
      tenantId: 'tenant-A',
      userId: 'user-1',
      recipient: 'titus@example.com',
      subject: 'Heads up',
      body: 'Pending review',
      templateKey: 'trusted-contact.review-request',
    });

    expect(result.deliveryId).toBe('delivery-1');
    expect(email.calls).toHaveLength(1);
    expect(prisma.created[0]).toMatchObject({
      channel: 'EMAIL',
      recipient: 'titus@example.com',
      templateKey: 'trusted-contact.review-request',
      payloadDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(prisma.updated[0]).toMatchObject({
      status: 'SENT',
      providerMessageId: 'sg-1',
    });
    expect(queue.enqueued).toHaveLength(0);
  });

  it('marks SKIPPED when the adapter has no creds', async () => {
    const email = makeAdapter('EMAIL', { ok: true, skipped: true });
    const prisma = makePrisma();
    const queue = makeQueue();
    const svc = new NotificationService(
      email as unknown as EmailAdapter,
      makeAdapter('SMS', { ok: true }) as unknown as SmsAdapter,
      makeAdapter('PUSH', { ok: true }) as unknown as PushAdapter,
      makeAdapter('IN_APP', { ok: true }) as unknown as InAppAdapter,
      makeAdapter('WEBSOCKET', { ok: true }) as unknown as WebsocketAdapter,
      prisma.raw,
      queue.raw,
    );

    await svc.send({
      channel: 'EMAIL',
      recipient: 'titus@example.com',
      subject: 's',
      body: 'b',
      templateKey: 't',
    });

    expect(prisma.updated[0]).toMatchObject({ status: 'SKIPPED' });
    expect(queue.enqueued).toHaveLength(0); // skipped is not a retry-worthy state
  });

  it('on adapter failure, marks FAILED and enqueues a retry', async () => {
    const email = makeAdapter('EMAIL', { ok: false, error: 'upstream 500' });
    const prisma = makePrisma();
    const queue = makeQueue();
    const svc = new NotificationService(
      email as unknown as EmailAdapter,
      makeAdapter('SMS', { ok: true }) as unknown as SmsAdapter,
      makeAdapter('PUSH', { ok: true }) as unknown as PushAdapter,
      makeAdapter('IN_APP', { ok: true }) as unknown as InAppAdapter,
      makeAdapter('WEBSOCKET', { ok: true }) as unknown as WebsocketAdapter,
      prisma.raw,
      queue.raw,
    );

    await svc.send({
      channel: 'EMAIL',
      recipient: 'x@example.com',
      subject: 's',
      body: 'b',
      templateKey: 't',
    });

    expect(prisma.updated[0]).toMatchObject({
      status: 'FAILED',
      lastError: 'upstream 500',
    });
    expect(queue.enqueued).toEqual([
      {
        name: 'notification-delivery',
        payload: expect.objectContaining({ channel: 'email' }),
      },
    ]);
  });

  it('dispatches to the SMS adapter when channel is SMS', async () => {
    const email = makeAdapter('EMAIL', { ok: true });
    const sms = makeAdapter('SMS', { ok: true });
    const prisma = makePrisma();
    const queue = makeQueue();
    const svc = new NotificationService(
      email as unknown as EmailAdapter,
      sms as unknown as SmsAdapter,
      makeAdapter('PUSH', { ok: true }) as unknown as PushAdapter,
      makeAdapter('IN_APP', { ok: true }) as unknown as InAppAdapter,
      makeAdapter('WEBSOCKET', { ok: true }) as unknown as WebsocketAdapter,
      prisma.raw,
      queue.raw,
    );

    await svc.send({
      channel: 'SMS',
      recipient: '+15551234567',
      subject: 's',
      body: 'b',
      templateKey: 't',
    });

    expect(email.calls).toHaveLength(0);
    expect(sms.calls).toHaveLength(1);
  });

  it('CP-9 retryFromQueue: re-attempts + updates the row on success', async () => {
    const prisma = makePrisma();
    const svc = buildSvc(prisma, makeQueue(), { emailOk: true });
    await svc.retryFromQueue({
      deliveryId: 'delivery-1',
      channel: 'email',
      recipient: 'x@example.com',
      subject: 's',
      body: 'b',
    });
    expect(prisma.updated[0]).toMatchObject({ status: 'SENT' });
  });

  it('CP-9 retryFromQueue: throws on persistent failure so BullMQ retries', async () => {
    const prisma = makePrisma();
    const svc = buildSvc(prisma, makeQueue(), { emailOk: false });
    await expect(
      svc.retryFromQueue({
        deliveryId: 'delivery-1',
        channel: 'email',
        recipient: 'x@example.com',
        subject: 's',
        body: 'b',
      }),
    ).rejects.toThrow(/still failing/);
    expect(prisma.updated[0]).toMatchObject({ status: 'FAILED' });
  });

  it('CP-9 markRead: stamps readAt for the user\'s delivery', async () => {
    const prisma = makePrisma();
    const svc = buildSvc(prisma, makeQueue());
    await svc.markRead('delivery-1', 'user-1');
    expect(prisma.updated[0]).toHaveProperty('readAt');
  });
});
