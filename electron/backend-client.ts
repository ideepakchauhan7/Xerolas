import { randomUUID } from 'node:crypto';
import type { QuickActionId } from '../src/shared/types';

export class GatewayRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GatewayRequestError';
    this.status = status;
  }
}

interface AnalyzeResponsePayload {
  text?: string;
  provider?: string;
  model?: string;
  usedFallback?: boolean;
  message?: string;
}

interface SessionBootstrapPayload {
  token?: string;
  expiresAt?: string;
  expiresInSeconds?: number;
  message?: string;
}

export interface BackendSession {
  token: string;
  expiresAt: string;
  expiresAtMs: number;
}

export interface SessionBootstrapInput {
  backendBaseUrl: string;
  appVersion: string;
  platform: string;
}

export interface AnalyzeImageInput {
  backendBaseUrl: string;
  quickActionId: QuickActionId;
  promptTemplate: string;
  imageBytes: Uint8Array;
  appVersion: string;
  platform: string;
  sessionToken: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function isLocalHttpTarget(url: URL): boolean {
  return (
    url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase())
  );
}

function assertSecureTarget(url: URL): void {
  if (isLocalHttpTarget(url)) {
    return;
  }

  if (url.protocol !== 'https:') {
    throw new Error('The desktop app only permits HTTPS backend URLs outside local development.');
  }
}

async function requestJson<T>(input: {
  backendBaseUrl: string;
  method: 'GET' | 'POST';
  pathname: string;
  body?: FormData | string;
  headers?: Record<string, string>;
}): Promise<T> {
  const baseUrl = normalizeBaseUrl(input.backendBaseUrl);
  const url = new URL(`${baseUrl}${input.pathname}`);
  assertSecureTarget(url);

  const response = await fetch(url, {
    method: input.method,
    headers: {
      Accept: 'application/json',
      ...input.headers
    },
    body: input.body
  });

  const rawBody = await response.text();
  let parsedBody: Record<string, unknown> = {};

  try {
    parsedBody = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    parsedBody = {};
  }

  if (!response.ok) {
    const message =
      typeof parsedBody.message === 'string' && parsedBody.message.trim()
        ? parsedBody.message.trim()
        : rawBody.trim() || `Gateway request failed with status ${response.status}.`;
    throw new GatewayRequestError(response.status, message);
  }

  return parsedBody as T;
}

export async function requestSession(
  input: SessionBootstrapInput
): Promise<BackendSession> {
  const payload = await requestJson<SessionBootstrapPayload>({
    backendBaseUrl: input.backendBaseUrl,
    method: 'POST',
    pathname: '/api/v1/session',
    body: JSON.stringify({
      appVersion: input.appVersion,
      platform: input.platform
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (typeof payload.token !== 'string' || !payload.token.trim()) {
    throw new Error('The backend returned no session token.');
  }

  if (typeof payload.expiresAt !== 'string' || !payload.expiresAt.trim()) {
    throw new Error('The backend returned no session expiry.');
  }

  const expiresAtMs = Date.parse(payload.expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    throw new Error('The backend returned an invalid session expiry.');
  }

  return {
    token: payload.token.trim(),
    expiresAt: payload.expiresAt.trim(),
    expiresAtMs
  };
}

export async function analyzeImage(
  input: AnalyzeImageInput
): Promise<{ text: string; provider: string; model: string; usedFallback: boolean }> {
  const body = new FormData();
  body.set('quickActionId', input.quickActionId);
  body.set('promptTemplate', input.promptTemplate);
  body.set('appVersion', input.appVersion);
  body.set('platform', input.platform);
  body.set('image', new Blob([input.imageBytes], { type: 'image/png' }), 'capture.png');

  const payload = await requestJson<AnalyzeResponsePayload>({
    backendBaseUrl: input.backendBaseUrl,
    method: 'POST',
    pathname: '/api/v1/analyze',
    body,
    headers: {
      'X-Xerolas-Session': input.sessionToken,
      'X-Xerolas-Timestamp': `${Date.now()}`,
      'X-Xerolas-Nonce': randomUUID()
    }
  });

  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    throw new Error('The backend returned no text for this capture.');
  }

  return {
    text: payload.text.trim(),
    provider:
      typeof payload.provider === 'string' && payload.provider.trim()
        ? payload.provider.trim()
        : 'unknown',
    model:
      typeof payload.model === 'string' && payload.model.trim()
        ? payload.model.trim()
        : 'unknown',
    usedFallback: Boolean(payload.usedFallback)
  };
}
