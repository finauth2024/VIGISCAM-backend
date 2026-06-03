import { Injectable } from '@nestjs/common';

export interface WorkerHealth {
  name: string;
  queue: string;
  running: boolean;
  startedAt: Date;
}

/**
 * CP-10 — a central registry every BullMQ worker reports to on startup, so the
 * queue-admin metrics surface can show which workers are alive (reviewer #11
 * "worker health checks"). Workers register on onModuleInit and mark stopped on
 * shutdown.
 */
@Injectable()
export class WorkerHealthRegistry {
  private readonly workers = new Map<string, WorkerHealth>();

  register(name: string, queue: string): void {
    this.workers.set(name, { name, queue, running: true, startedAt: new Date() });
  }

  markStopped(name: string): void {
    const w = this.workers.get(name);
    if (w) w.running = false;
  }

  list(): WorkerHealth[] {
    return [...this.workers.values()];
  }
}
