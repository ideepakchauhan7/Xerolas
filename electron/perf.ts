import { performance } from 'node:perf_hooks';

const enabled = process.env.XEROLAS_PERF === '1';

function formatDetails(details?: Record<string, unknown>): string {
  if (!details || !Object.keys(details).length) {
    return '';
  }

  return ` ${JSON.stringify(details)}`;
}

export class PerfSession {
  private readonly startTime = performance.now();

  private lastMarkTime = this.startTime;

  constructor(private readonly name: string) {
    this.mark('start');
  }

  mark(step: string, details?: Record<string, unknown>): void {
    if (!enabled) {
      return;
    }

    const now = performance.now();
    const total = Math.round((now - this.startTime) * 10) / 10;
    const delta = Math.round((now - this.lastMarkTime) * 10) / 10;
    this.lastMarkTime = now;
    console.info(`[xerolas:perf] ${this.name}:${step} +${delta}ms total=${total}ms${formatDetails(details)}`);
  }
}

export function createPerfSession(name: string): PerfSession | null {
  if (!enabled) {
    return null;
  }

  return new PerfSession(name);
}

export function perfMark(name: string, details?: Record<string, unknown>): void {
  if (!enabled) {
    return;
  }

  console.info(`[xerolas:perf] ${name}${formatDetails(details)}`);
}

export function isPerfLoggingEnabled(): boolean {
  return enabled;
}
