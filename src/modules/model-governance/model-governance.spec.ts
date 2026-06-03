import { AiFeedbackService } from './ai-feedback.service';
import { ModelRegistryService } from './model-registry.service';

const USER = { userId: 'u1', tenantId: 't1', email: 'r@x', role: 'REVIEWER' } as never;

describe('ModelRegistryService.setStatus', () => {
  it('promoting to ACTIVE retires the prior active version of the same service', async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const update = jest.fn(async ({ data }: { data: unknown }) => ({ id: 'm1', ...(data as object) }));
    const prisma = {
      modelRegistry: {
        findUnique: jest.fn(async () => ({ id: 'm1', serviceKind: 'NLP_CLASSIFIER' })),
        updateMany,
        update,
      },
    } as never;
    const svc = new ModelRegistryService(prisma);
    await svc.setStatus('m1', 'ACTIVE');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ serviceKind: 'NLP_CLASSIFIER', status: 'ACTIVE' }),
        data: { status: 'RETIRED' },
      }),
    );
    expect(update).toHaveBeenCalled();
  });

  it('non-ACTIVE status does not retire others', async () => {
    const updateMany = jest.fn();
    const prisma = {
      modelRegistry: {
        findUnique: jest.fn(async () => ({ id: 'm1', serviceKind: 'NLP_CLASSIFIER' })),
        updateMany,
        update: jest.fn(async () => ({ id: 'm1' })),
      },
    } as never;
    await new ModelRegistryService(prisma).setStatus('m1', 'SHADOW');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('AiFeedbackService.submitFeedback', () => {
  function makePrisma() {
    const calls: Record<string, unknown> = {};
    const prisma = {
      aIDecision: {
        findUnique: jest.fn(async () => ({
          id: 'd1',
          serviceKind: 'AUTHENTICITY_LIVE_FACE_SEAL',
          modelVersion: 'authenticity-1.1.0',
        })),
        update: jest.fn(async (args: { data: unknown }) => {
          calls.update = args.data;
          return { id: 'd1', ...(args.data as object) };
        }),
      },
      modelFeedback: {
        create: jest.fn(async (args: { data: unknown }) => {
          calls.feedback = args.data;
          return { id: 'f1' };
        }),
      },
      auditLog: { create: jest.fn(async () => ({ id: 'a1' })) },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    } as never;
    return { prisma, calls };
  }

  it('FALSE_POSITIVE maps to CORRECTED + writes a feedback row', async () => {
    const { prisma, calls } = makePrisma();
    await new AiFeedbackService(prisma).submitFeedback(USER, 'd1', { label: 'FALSE_POSITIVE' });
    expect((calls.update as { reviewStatus: string }).reviewStatus).toBe('CORRECTED');
    expect((calls.feedback as { reviewerLabel: string }).reviewerLabel).toBe('FALSE_POSITIVE');
  });

  it('CONFIRMED_CORRECT maps to CONFIRMED', async () => {
    const { prisma, calls } = makePrisma();
    await new AiFeedbackService(prisma).submitFeedback(USER, 'd1', { label: 'CONFIRMED_CORRECT' });
    expect((calls.update as { reviewStatus: string }).reviewStatus).toBe('CONFIRMED');
  });
});
