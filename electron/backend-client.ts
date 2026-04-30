import { randomUUID } from 'node:crypto';
import type { QuickActionId, SourceLink } from '../src/shared/types';

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
  groundingUsed?: boolean;
  sources?: unknown;
  message?: string;
}

interface SessionBootstrapPayload {
  token?: string;
  expiresAt?: string;
  expiresInSeconds?: number;
  message?: string;
}

interface StreamMetaPayload {
  provider?: string;
  model?: string;
  usedFallback?: boolean;
}

interface StreamDeltaPayload {
  text?: string;
}

interface StreamGroundingPayload {
  groundingUsed?: boolean;
  sources?: unknown;
}

interface StreamSearchPayload {
  webSearchInProgress?: boolean;
}

interface StreamCompletePayload {
  text?: string;
  provider?: string;
  model?: string;
  usedFallback?: boolean;
  groundingUsed?: boolean;
  sources?: unknown;
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
  question?: string;
}

export interface AnalyzeStreamHandlers {
  onMeta?: (payload: { provider: string; model: string; usedFallback: boolean }) => void;
  onDelta?: (payload: { chunk: string; text: string }) => void;
  onSearch?: (payload: { webSearchInProgress: boolean }) => void;
  onGrounding?: (payload: { groundingUsed: boolean; sources: SourceLink[] }) => void;
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

function buildAnalyzeBody(input: AnalyzeImageInput): FormData {
  const body = new FormData();
  body.set('quickActionId', input.quickActionId);
  body.set('promptTemplate', input.promptTemplate);
  body.set('appVersion', input.appVersion);
  body.set('platform', input.platform);
  if (input.question?.trim()) {
    body.set('question', input.question.trim());
  }
  body.set('image', new Blob([input.imageBytes], { type: 'image/png' }), 'capture.png');
  return body;
}

function buildTrustHeaders(sessionToken: string): Record<string, string> {
  return {
    'X-Xerolas-Session': sessionToken,
    'X-Xerolas-Timestamp': `${Date.now()}`,
    'X-Xerolas-Nonce': randomUUID()
  };
}

function normalizeSourceLinks(value: unknown): SourceLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const raw = entry as Record<string, unknown>;
      if (
        typeof raw.title !== 'string' ||
        !raw.title.trim() ||
        typeof raw.url !== 'string' ||
        !raw.url.trim() ||
        typeof raw.host !== 'string' ||
        !raw.host.trim()
      ) {
        return null;
      }

      return {
        title: raw.title.trim(),
        url: raw.url.trim(),
        host: raw.host.trim()
      } satisfies SourceLink;
    })
    .filter((entry): entry is SourceLink => entry !== null)
    .slice(0, 5);
}

function parseSseEvents(chunkBuffer: string): {
  events: Array<{ event: string; data: string }>;
  remainder: string;
} {
  const normalized = chunkBuffer.replace(/\r\n/g, '\n');
  const segments = normalized.split('\n\n');
  const remainder = segments.pop() ?? '';
  const events = segments
    .map((segment) => {
      const lines = segment.split('\n');
      let event = 'message';
      const dataLines: string[] = [];

      lines.forEach((line) => {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim() || 'message';
          return;
        }

        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      });

      return {
        event,
        data: dataLines.join('\n').trim()
      };
    })
    .filter((entry) => entry.data);

  return { events, remainder };
}

async function readErrorResponse(response: Response): Promise<never> {
  const rawBody = await response.text();
  let parsedBody: Record<string, unknown> = {};

  try {
    parsedBody = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    parsedBody = {};
  }

  const message =
    typeof parsedBody.message === 'string' && parsedBody.message.trim()
      ? parsedBody.message.trim()
      : rawBody.trim() || `Gateway request failed with status ${response.status}.`;

  throw new GatewayRequestError(response.status, message);
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
): Promise<{ text: string; provider: string; model: string; usedFallback: boolean; groundingUsed: boolean; sources: SourceLink[] }> {
  const payload = await requestJson<AnalyzeResponsePayload>({
    backendBaseUrl: input.backendBaseUrl,
    method: 'POST',
    pathname: '/api/v1/analyze',
    body: buildAnalyzeBody(input),
    headers: buildTrustHeaders(input.sessionToken)
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
    usedFallback: Boolean(payload.usedFallback),
    groundingUsed: Boolean(payload.groundingUsed),
    sources: normalizeSourceLinks(payload.sources)
  };
}

export async function streamAnalyzeImage(
  input: AnalyzeImageInput,
  handlers: AnalyzeStreamHandlers = {}
): Promise<{ text: string; provider: string; model: string; usedFallback: boolean; groundingUsed: boolean; sources: SourceLink[] }> {
  const baseUrl = normalizeBaseUrl(input.backendBaseUrl);
  const url = new URL(`${baseUrl}/api/v1/analyze/stream`);
  assertSecureTarget(url);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      ...buildTrustHeaders(input.sessionToken)
    },
    body: buildAnalyzeBody(input)
  });

  if (!response.ok) {
    await readErrorResponse(response);
  }

  if (!response.body) {
    throw new Error('The backend returned no stream for this capture.');
  }

  if (response.headers.get('X-Xerolas-Web-Search') === 'active') {
    handlers.onSearch?.({ webSearchInProgress: true });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let aggregateText = '';
  let provider = 'gemini';
  let model = 'unknown';
  let usedFallback = false;
  let groundingUsed = false;
  let sources: SourceLink[] = [];

  const processEvent = (eventName: string, dataText: string): void => {
    if (!dataText || dataText === '[DONE]') {
      return;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(dataText) as Record<string, unknown>;
    } catch {
      return;
    }

    if (eventName === 'meta') {
      const meta = payload as StreamMetaPayload;
      provider = typeof meta.provider === 'string' && meta.provider.trim() ? meta.provider.trim() : provider;
      model = typeof meta.model === 'string' && meta.model.trim() ? meta.model.trim() : model;
      usedFallback = Boolean(meta.usedFallback);
      handlers.onMeta?.({ provider, model, usedFallback });
      return;
    }

    if (eventName === 'search') {
      const search = payload as StreamSearchPayload;
      if (search.webSearchInProgress) {
        handlers.onSearch?.({ webSearchInProgress: true });
      }
      return;
    }

    if (eventName === 'delta') {
      const delta = payload as StreamDeltaPayload;
      const chunk = typeof delta.text === 'string' ? delta.text : '';
      if (!chunk) {
        return;
      }
      aggregateText += chunk;
      handlers.onDelta?.({ chunk, text: aggregateText });
      return;
    }

    if (eventName === 'grounding') {
      const grounding = payload as StreamGroundingPayload;
      const nextSources = normalizeSourceLinks(grounding.sources);
      const nextGroundingUsed = Boolean(grounding.groundingUsed) || nextSources.length > 0;
      if (!nextGroundingUsed) {
        return;
      }

      groundingUsed = true;
      if (nextSources.length) {
        sources = nextSources;
      }
      handlers.onGrounding?.({ groundingUsed: true, sources });
      return;
    }

    if (eventName === 'complete') {
      const complete = payload as StreamCompletePayload;
      aggregateText =
        typeof complete.text === 'string' && complete.text.trim() ? complete.text : aggregateText;
      provider =
        typeof complete.provider === 'string' && complete.provider.trim() ? complete.provider.trim() : provider;
      model = typeof complete.model === 'string' && complete.model.trim() ? complete.model.trim() : model;
      usedFallback = Boolean(complete.usedFallback);
      const completeSources = normalizeSourceLinks(complete.sources);
      groundingUsed = Boolean(complete.groundingUsed) || groundingUsed || completeSources.length > 0;
      sources = completeSources.length ? completeSources : sources;
      return;
    }

    if (eventName === 'error') {
      const message =
        typeof payload.message === 'string' && payload.message.trim()
          ? payload.message.trim()
          : 'The streamed Gemini request failed.';
      throw new Error(message);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const parsed = parseSseEvents(buffer);
    buffer = parsed.remainder;

    for (const event of parsed.events) {
      processEvent(event.event, event.data);
    }

    if (done) {
      break;
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    const parsed = parseSseEvents(`${trailing}\n\n`);
    parsed.events.forEach((event) => {
      processEvent(event.event, event.data);
    });
  }

  if (!aggregateText.trim()) {
    throw new Error('The backend returned no text for this capture.');
  }

  return {
    text: aggregateText.trim(),
    provider,
    model,
    usedFallback,
    groundingUsed,
    sources
  };
}
