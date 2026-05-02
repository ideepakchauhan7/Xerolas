import { DurableObject } from 'cloudflare:workers';
import { createWorkerRuntimeContext, type CloudflareWorkerBindings } from '../backend/config';
import { handleBackendRequest } from '../backend/handlers';

interface ReplayNonceRequestBody {
  nonce?: string;
  nowMs?: number;
  expiresAtMs?: number;
}

interface RateLimitRequestBody {
  key?: string;
  nowMs?: number;
  limit?: number;
  windowMs?: number;
}

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

const NONCE_PREFIX = 'nonce:';
const RATE_PREFIX = 'rate:';

export class ReplayNonceCoordinator extends DurableObject<CloudflareWorkerBindings> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed.', { status: 405 });
    }

    const path = new URL(request.url).pathname;
    if (path === '/rate') {
      return this.handleRateLimit(request);
    }

    if (path !== '/consume') {
      return new Response('Not found.', { status: 404 });
    }

    return this.handleNonceConsume(request);
  }

  private async handleNonceConsume(request: Request): Promise<Response> {
    let body: ReplayNonceRequestBody;
    try {
      body = (await request.json()) as ReplayNonceRequestBody;
    } catch {
      return new Response('Invalid replay nonce request body.', { status: 400 });
    }

    const nonce = typeof body.nonce === 'string' ? body.nonce.trim() : '';
    const nowMs = typeof body.nowMs === 'number' ? body.nowMs : Number.NaN;
    const expiresAtMs =
      typeof body.expiresAtMs === 'number' ? body.expiresAtMs : Number.NaN;

    if (!nonce || !Number.isFinite(nowMs) || !Number.isFinite(expiresAtMs)) {
      return new Response('Replay nonce request is missing required fields.', { status: 400 });
    }

    const storageKey = `${NONCE_PREFIX}${nonce}`;
    const existingExpiry = await this.ctx.storage.get<number>(storageKey);
    if (typeof existingExpiry === 'number' && existingExpiry > nowMs) {
      return new Response('Replay nonce already used.', { status: 409 });
    }

    await this.ctx.storage.put(storageKey, expiresAtMs);
    await this.scheduleCleanup(expiresAtMs);

    return new Response(null, { status: 204 });
  }

  private async handleRateLimit(request: Request): Promise<Response> {
    let body: RateLimitRequestBody;
    try {
      body = (await request.json()) as RateLimitRequestBody;
    } catch {
      return new Response('Invalid rate limit request body.', { status: 400 });
    }

    const key = typeof body.key === 'string' ? body.key.trim() : '';
    const nowMs = typeof body.nowMs === 'number' ? body.nowMs : Number.NaN;
    const limit = typeof body.limit === 'number' ? body.limit : Number.NaN;
    const windowMs = typeof body.windowMs === 'number' ? body.windowMs : Number.NaN;

    if (!key || !Number.isFinite(nowMs) || !Number.isFinite(limit) || !Number.isFinite(windowMs)) {
      return new Response('Rate limit request is missing required fields.', { status: 400 });
    }

    if (limit <= 0) {
      return new Response(null, { status: 204 });
    }

    const storageKey = `${RATE_PREFIX}${key}`;
    const existing = await this.ctx.storage.get<RateLimitBucket>(storageKey);
    const resetAtMs = existing && existing.resetAtMs > nowMs ? existing.resetAtMs : nowMs + windowMs;
    const count = existing && existing.resetAtMs > nowMs ? existing.count : 0;

    if (count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));
      return new Response('Rate limit exceeded.', {
        status: 429,
        headers: { 'Retry-After': `${retryAfterSeconds}` }
      });
    }

    await this.ctx.storage.put(storageKey, { count: count + 1, resetAtMs });
    await this.scheduleCleanup(resetAtMs);

    return new Response(null, { status: 204 });
  }

  private async scheduleCleanup(expiresAtMs: number): Promise<void> {
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (currentAlarm === null || expiresAtMs < currentAlarm) {
      await this.ctx.storage.setAlarm(expiresAtMs);
    }
  }

  async alarm(): Promise<void> {
    const nowMs = Date.now();
    let nextAlarmAt: number | null = null;
    const nonceEntries = await this.ctx.storage.list<number>({ prefix: NONCE_PREFIX });
    for (const [key, expiresAtMs] of nonceEntries) {
      if (expiresAtMs <= nowMs) {
        await this.ctx.storage.delete(key);
        continue;
      }

      nextAlarmAt = nextAlarmAt === null ? expiresAtMs : Math.min(nextAlarmAt, expiresAtMs);
    }

    const rateEntries = await this.ctx.storage.list<RateLimitBucket>({ prefix: RATE_PREFIX });
    for (const [key, bucket] of rateEntries) {
      if (bucket.resetAtMs <= nowMs) {
        await this.ctx.storage.delete(key);
        continue;
      }

      nextAlarmAt = nextAlarmAt === null ? bucket.resetAtMs : Math.min(nextAlarmAt, bucket.resetAtMs);
    }

    if (nextAlarmAt !== null) {
      await this.ctx.storage.setAlarm(nextAlarmAt);
    }
  }
}

export default {
  async fetch(request: Request, env: CloudflareWorkerBindings): Promise<Response> {
    try {
      return await handleBackendRequest(request, createWorkerRuntimeContext(env));
    } catch (error) {
      return new Response(
        `${JSON.stringify({
          message: error instanceof Error ? error.message : 'Unexpected backend failure.'
        })}\n`,
        {
          status: 500,
          headers: {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8'
          }
        }
      );
    }
  }
};
