import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const prismaMock = { isHealthy: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('liveness reports ok', () => {
    expect(controller.liveness().status).toBe('ok');
  });

  it('readiness reports ok when the database is up', async () => {
    prismaMock.isHealthy.mockResolvedValue(true);
    const res = await controller.readiness();
    expect(res.status).toBe('ok');
    expect(res.checks.database.status).toBe('up');
  });

  it('readiness fails (503) when the database is down', async () => {
    prismaMock.isHealthy.mockResolvedValue(false);
    await expect(controller.readiness()).rejects.toThrow();
  });
});
