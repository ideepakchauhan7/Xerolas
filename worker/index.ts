import { DurableObject } from 'cloudflare:workers';
import { createWorkerRuntimeContext, type CloudflareWorkerBindings } from '../backend/config';
import { handleBackendRequest } from '../backend/handlers';

interface ReplayNonceRequestBody {
  nonce?: string;
  nowMs?: number;
  expiresAtMs?: number;
}

const NONCE_PREFIX = 'nonce:';

export class ReplayNonceCoordinator extends DurableObject<CloudflareWorkerBindings> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed.', { status: 405 });
    }

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

    const currentAlarm = await this.ctx.storage.getAlarm();
    if (currentAlarm === null || expiresAtMs < currentAlarm) {
      await this.ctx.storage.setAlarm(expiresAtMs);
    }

    return new Response(null, { status: 204 });
  }

  async alarm(): Promise<void> {
    const nowMs = Date.now();
    const entries = await this.ctx.storage.list<number>({ prefix: NONCE_PREFIX });
    let nextAlarmAt: number | null = null;

    for (const [key, expiresAtMs] of entries) {
      if (expiresAtMs <= nowMs) {
        await this.ctx.storage.delete(key);
        continue;
      }

      nextAlarmAt = nextAlarmAt === null ? expiresAtMs : Math.min(nextAlarmAt, expiresAtMs);
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
