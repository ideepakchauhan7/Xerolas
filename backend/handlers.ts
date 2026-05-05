import { createHash } from 'node:crypto';
import type { BackendRuntimeContext } from './config';
import { analyzeImageWithGemini, streamImageWithGemini } from './gemini';
import { analyzeImageWithOpenRouter, streamImageWithOpenRouter } from './openrouter';
import { isCapacityErrorMessage, isRetryableProviderError } from './provider-error';
import type { SourceLink } from '../src/shared/types';
import {
  authorizeAnalyzeRequest,
  issueSessionToken,
  NONCE_HEADER,
  SESSION_HEADER,
  TIMESTAMP_HEADER
} from './session-trust';

interface JsonRecord {
  [key: string]: unknown;
}

interface AnalyzeRequestPayload {
  quickActionId: string;
  promptTemplate: string;
  question?: string;
  imageMimeType: string;
  imageBase64Data: string;
}

interface ProviderAnalysisResult {
  text: string;
  provider: string;
  model: string;
  usedFallback: boolean;
  groundingUsed: boolean;
  sources: SourceLink[];
}

type ProviderStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'grounding'; grounding: { groundingUsed: boolean; sources: SourceLink[] } };

interface ProviderStreamResult {
  provider: string;
  model: string;
  usedFallback: boolean;
  webSearchAttempted: boolean;
  stream: AsyncGenerator<ProviderStreamEvent>;
  getGrounding: () => { groundingUsed: boolean; sources: SourceLink[] };
}

const WEB_SEARCH_HEADER = 'X-Xerolas-Web-Search';
const CORS_ALLOWED_HEADERS = `Content-Type, ${SESSION_HEADER}, ${NONCE_HEADER}, ${TIMESTAMP_HEADER}`;
const MAX_SESSION_BODY_CHARS = 4 * 1024;
const MAX_ANALYZE_REQUEST_CHARS = 18 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PROMPT_CHARS = 4_000;
const MAX_QUESTION_CHARS = 1_200;
const MAX_QUICK_ACTION_CHARS = 80;
const RATE_LIMIT_WINDOW_MS = 60_000;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function getRequestOrigin(request: Request): string {
  return request.headers.get('Origin')?.trim() ?? '';
}

function isBrowserOriginAllowed(request: Request, context: BackendRuntimeContext): boolean {
  const origin = getRequestOrigin(request);
  if (!origin) {
    return true;
  }

  return context.config.allowedOrigins.includes(origin);
}

function corsHeaders(request: Request, context: BackendRuntimeContext, exposeHeaders: string[] = []): Record<string, string> {
  const origin = getRequestOrigin(request);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin'
  };

  if (origin && context.config.allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  if (exposeHeaders.length > 0) {
    headers['Access-Control-Expose-Headers'] = exposeHeaders.join(', ');
  }

  return headers;
}

function json(
  request: Request,
  context: BackendRuntimeContext,
  status: number,
  payload: JsonRecord,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(status === 204 ? null : `${JSON.stringify(payload)}\n`, {
    status,
    headers: {
      ...corsHeaders(request, context),
      ...extraHeaders,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function sseHeaders(
  request: Request,
  context: BackendRuntimeContext,
  webSearchAttempted = false
): Record<string, string> {
  return {
    ...corsHeaders(request, context, [WEB_SEARCH_HEADER]),
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8',
    ...(webSearchAttempted ? { [WEB_SEARCH_HEADER]: 'active' } : {})
  };
}

function encodeSseEvent(event: string, payload: JsonRecord): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function assertContentLengthUnderLimit(request: Request, maxChars: number, label: string): void {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) {
    return;
  }

  const parsed = Number.parseInt(contentLength, 10);
  if (Number.isFinite(parsed) && parsed > maxChars) {
    throw new Error(`${label} is too large.`);
  }
}

async function readJsonBody(request: Request, maxChars: number): Promise<JsonRecord> {
  assertContentLengthUnderLimit(request, maxChars, 'Request body');
  const body = await request.text();
  if (body.length > maxChars) {
    throw new Error('Request body is too large.');
  }

  if (!body.trim()) {
    return {};
  }

  return JSON.parse(body) as JsonRecord;
}

function sanitizeLimitedString(
  value: unknown,
  fallback: string,
  maxLength: number,
  label: string
): string {
  const normalized = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  if (normalized.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }

  return normalized;
}

function assertAllowedImageMimeType(mimeType: string): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType.toLowerCase())) {
    throw new Error('Only PNG, JPEG, and WebP capture images are supported.');
  }
}

function assertImageSize(byteLength: number): void {
  if (byteLength <= 0) {
    throw new Error('A captured image file is required.');
  }

  if (byteLength > MAX_IMAGE_BYTES) {
    throw new Error('The captured image is too large.');
  }
}

function estimateBase64DecodedBytes(base64Data: string): number {
  const padding = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0;
  return Math.floor((base64Data.length * 3) / 4) - padding;
}

function getClientAddress(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP')?.trim() ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown-client'
  );
}

function hashRateLimitKey(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 32);
}

async function enforceRateLimit(
  context: BackendRuntimeContext,
  key: string,
  limit: number
): Promise<void> {
  const result = await context.rateLimiter.check({
    key,
    nowMs: Date.now(),
    limit,
    windowMs: RATE_LIMIT_WINDOW_MS
  });

  if (!result.accepted) {
    throw new Error(`Rate limit exceeded. Retry after ${result.retryAfterSeconds} seconds.`);
  }
}

function base64EncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function readAnalyzeRequest(request: Request): Promise<AnalyzeRequestPayload> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const quickActionId = sanitizeLimitedString(
      formData.get('quickActionId'),
      'describe',
      MAX_QUICK_ACTION_CHARS,
      'Quick action'
    );
    const promptTemplate = sanitizeLimitedString(
      formData.get('promptTemplate'),
      'Answer the most useful question about this selected content. Focus on the main subject, solve or explain the visible content when possible, ignore browser or app chrome unless it matters, and keep the answer concise, grounded, and practical. Use plain text only.',
      MAX_PROMPT_CHARS,
      'Prompt'
    );
    const image = formData.get('image');

    if (!(image instanceof File)) {
      throw new Error('A captured image file is required.');
    }

    const question =
      typeof formData.get('question') === 'string' && formData.get('question')
        ? sanitizeLimitedString(formData.get('question'), '', MAX_QUESTION_CHARS, 'Question')
        : undefined;
    const imageMimeType = image.type?.trim() || 'image/png';
    assertAllowedImageMimeType(imageMimeType);
    assertImageSize(image.size);
    const imageBase64Data = base64EncodeBytes(new Uint8Array(await image.arrayBuffer()));

    return {
      quickActionId,
      promptTemplate,
      question,
      imageMimeType,
      imageBase64Data
    };
  }

  const body = await readJsonBody(request, MAX_ANALYZE_REQUEST_CHARS);
  const quickActionId = sanitizeLimitedString(
    body.quickActionId,
    'describe',
    MAX_QUICK_ACTION_CHARS,
    'Quick action'
  );
  const promptTemplate = sanitizeLimitedString(
    body.promptTemplate,
    'Answer the most useful question about this selected content. Focus on the main subject, solve or explain the visible content when possible, ignore browser or app chrome unless it matters, and keep the answer concise, grounded, and practical. Use plain text only.',
    MAX_PROMPT_CHARS,
    'Prompt'
  );
  const question =
    typeof body.question === 'string' && body.question.trim()
      ? sanitizeLimitedString(body.question, '', MAX_QUESTION_CHARS, 'Question')
      : undefined;
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/);

  if (!match) {
    throw new Error('A captured image data URL is required.');
  }

  const imageMimeType = match[1];
  const imageBase64Data = match[2];
  assertAllowedImageMimeType(imageMimeType);
  assertImageSize(estimateBase64DecodedBytes(imageBase64Data));

  return {
    quickActionId,
    promptTemplate,
    question,
    imageMimeType,
    imageBase64Data
  };
}

function getAnalyzeErrorStatus(message: string): number {
  return message.includes('temporarily waiting for Gemini capacity')
    ? 503
    : message.includes('Missing backend trust headers') ||
        message.includes('session token') ||
        message.includes('request timestamp')
      ? 401
      : message.includes('nonce has already been used')
        ? 409
      : message.includes('Rate limit exceeded')
        ? 429
        : message.includes('captured image') ||
            message.includes('too large') ||
            message.includes('too long') ||
            message.includes('Only PNG') ||
            message.includes('Request body')
          ? 400
          : 502;
}

function hasAnalysisProvider(context: BackendRuntimeContext): boolean {
  return Boolean(context.config.geminiApiKey || context.config.openRouterApiKey);
}

function shouldTryOpenRouterFallback(error: unknown): boolean {
  return (
    isRetryableProviderError(error) ||
    (error instanceof Error && isCapacityErrorMessage(error.message))
  );
}

function getMissingProviderMessage(): string {
  return 'Configure GEMINI_API_KEY or OPENROUTER_API_KEY before using analysis.';
}

async function analyzeWithConfiguredProviders(
  context: BackendRuntimeContext,
  payload: AnalyzeRequestPayload
): Promise<ProviderAnalysisResult> {
  let geminiError: unknown = null;

  if (context.config.geminiApiKey) {
    try {
      const analysis = await analyzeImageWithGemini({
        apiKey: context.config.geminiApiKey,
        primaryModel: context.config.geminiModel,
        fallbackModel: context.config.geminiFallbackModel,
        promptTemplate: payload.promptTemplate,
        question: payload.question,
        imageMimeType: payload.imageMimeType,
        imageBase64Data: payload.imageBase64Data,
        enableWebSearch: true
      });

      return {
        ...analysis,
        provider: 'gemini'
      };
    } catch (error) {
      if (!context.config.openRouterApiKey || !shouldTryOpenRouterFallback(error)) {
        throw error;
      }

      geminiError = error;
    }
  }

  if (!context.config.openRouterApiKey) {
    throw geminiError instanceof Error ? geminiError : new Error(getMissingProviderMessage());
  }

  const analysis = await analyzeImageWithOpenRouter({
    apiKey: context.config.openRouterApiKey,
    model: context.config.openRouterModel,
    enableWebSearch: context.config.openRouterEnableWebSearch,
    promptTemplate: payload.promptTemplate,
    question: payload.question,
    imageMimeType: payload.imageMimeType,
    imageBase64Data: payload.imageBase64Data
  });

  return {
    ...analysis,
    provider: 'openrouter',
    usedFallback: Boolean(geminiError || context.config.geminiApiKey)
  };
}

async function openStreamWithConfiguredProviders(
  context: BackendRuntimeContext,
  payload: AnalyzeRequestPayload
): Promise<ProviderStreamResult> {
  let geminiError: unknown = null;

  if (context.config.geminiApiKey) {
    try {
      const opened = await streamImageWithGemini({
        apiKey: context.config.geminiApiKey,
        primaryModel: context.config.geminiModel,
        fallbackModel: context.config.geminiFallbackModel,
        promptTemplate: payload.promptTemplate,
        question: payload.question,
        imageMimeType: payload.imageMimeType,
        imageBase64Data: payload.imageBase64Data,
        enableWebSearch: true
      });

      return {
        ...opened,
        provider: 'gemini'
      };
    } catch (error) {
      if (!context.config.openRouterApiKey || !shouldTryOpenRouterFallback(error)) {
        throw error;
      }

      geminiError = error;
    }
  }

  if (!context.config.openRouterApiKey) {
    throw geminiError instanceof Error ? geminiError : new Error(getMissingProviderMessage());
  }

  const opened = await streamImageWithOpenRouter({
    apiKey: context.config.openRouterApiKey,
    model: context.config.openRouterModel,
    enableWebSearch: context.config.openRouterEnableWebSearch,
    promptTemplate: payload.promptTemplate,
    question: payload.question,
    imageMimeType: payload.imageMimeType,
    imageBase64Data: payload.imageBase64Data
  });

  return {
    ...opened,
    provider: 'openrouter',
    usedFallback: Boolean(geminiError || context.config.geminiApiKey)
  };
}

async function handleSessionBootstrap(
  request: Request,
  context: BackendRuntimeContext
): Promise<Response> {
  if (!context.config.sessionSecret) {
    return json(request, context, 503, {
      message: 'Configure CONTEXT_AI_SESSION_SECRET before using session bootstrap.'
    });
  }

  if (!isBrowserOriginAllowed(request, context)) {
    return json(request, context, 403, { message: 'Origin is not allowed.' });
  }

  try {
    await enforceRateLimit(
      context,
      `session:${hashRateLimitKey(getClientAddress(request))}`,
      context.config.sessionRateLimitPerMinute
    );
  } catch (error) {
    return json(request, context, 429, {
      message: error instanceof Error ? error.message : 'Rate limit exceeded.'
    });
  }

  try {
    const body = await readJsonBody(request, MAX_SESSION_BODY_CHARS);
    const appVersion = sanitizeLimitedString(body.appVersion, 'unknown', 80, 'App version');
    const platform = sanitizeLimitedString(body.platform, 'unknown', 80, 'Platform');
    const nowMs = Date.now();
    const session = issueSessionToken(
      context,
      {
        appVersion,
        platform
      },
      nowMs
    );

    return json(request, context, 200, {
      token: session.token,
      expiresAt: session.expiresAt,
      expiresInSeconds: session.expiresInSeconds,
      serverTime: new Date(nowMs).toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Session bootstrap failed.';
    return json(request, context, message.includes('too large') || message.includes('too long') ? 400 : 502, {
      message
    });
  }
}

async function handleAnalyze(
  request: Request,
  context: BackendRuntimeContext
): Promise<Response> {
  if (!hasAnalysisProvider(context)) {
    return json(request, context, 503, {
      message: getMissingProviderMessage()
    });
  }

  try {
    if (!isBrowserOriginAllowed(request, context)) {
      return json(request, context, 403, { message: 'Origin is not allowed.' });
    }

    const claims = await authorizeAnalyzeRequest(request, context);
    await enforceRateLimit(
      context,
      `analyze:${claims.sid}`,
      context.config.analyzeRateLimitPerMinute
    );
    const payload = await readAnalyzeRequest(request);
    const analysis = await analyzeWithConfiguredProviders(context, payload);

    return json(request, context, 200, {
      text: analysis.text,
      provider: analysis.provider,
      model: analysis.model,
      quickActionId: payload.quickActionId,
      usedFallback: analysis.usedFallback,
      groundingUsed: analysis.groundingUsed,
      sources: analysis.sources
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Gemini request failed.';
    return json(request, context, getAnalyzeErrorStatus(message), {
      message: error instanceof Error ? error.message : 'The Gemini request failed.'
    });
  }
}

async function handleAnalyzeStream(
  request: Request,
  context: BackendRuntimeContext
): Promise<Response> {
  if (!hasAnalysisProvider(context)) {
    return json(request, context, 503, {
      message: getMissingProviderMessage()
    });
  }

  try {
    if (!isBrowserOriginAllowed(request, context)) {
      return json(request, context, 403, { message: 'Origin is not allowed.' });
    }

    const claims = await authorizeAnalyzeRequest(request, context);
    await enforceRateLimit(
      context,
      `analyze:${claims.sid}`,
      context.config.analyzeRateLimitPerMinute
    );
    const payload = await readAnalyzeRequest(request);
    const opened = await openStreamWithConfiguredProviders(context, payload);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let aggregateText = '';

        controller.enqueue(
          encoder.encode(
            encodeSseEvent('meta', {
              provider: opened.provider,
              model: opened.model,
              quickActionId: payload.quickActionId,
              usedFallback: opened.usedFallback
            })
          )
        );

        if (opened.webSearchAttempted) {
          controller.enqueue(
            encoder.encode(
              encodeSseEvent('search', {
                webSearchInProgress: true
              })
            )
          );
        }

        try {
          for await (const streamEvent of opened.stream) {
            if (streamEvent.type === 'grounding') {
              controller.enqueue(
                encoder.encode(
                  encodeSseEvent('grounding', {
                    groundingUsed: streamEvent.grounding.groundingUsed,
                    sources: streamEvent.grounding.sources
                  })
                )
              );
              continue;
            }

            const chunk = streamEvent.text;
            if (!chunk) {
              continue;
            }

            aggregateText += chunk;
            controller.enqueue(
              encoder.encode(
                encodeSseEvent('delta', {
                  text: chunk
                })
              )
            );
          }

          controller.enqueue(
            encoder.encode(
              encodeSseEvent('complete', {
                text: aggregateText,
                provider: opened.provider,
                model: opened.model,
                quickActionId: payload.quickActionId,
                usedFallback: opened.usedFallback,
                groundingUsed: opened.getGrounding().groundingUsed,
                sources: opened.getGrounding().sources
              })
            )
          );
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              encodeSseEvent('error', {
                message: error instanceof Error ? error.message : 'The streamed Gemini request failed.'
              })
            )
          );
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: sseHeaders(request, context, opened.webSearchAttempted)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Gemini request failed.';
    return json(request, context, getAnalyzeErrorStatus(message), {
      message: error instanceof Error ? error.message : 'The Gemini request failed.'
    });
  }
}

export async function handleBackendRequest(
  request: Request,
  context: BackendRuntimeContext
): Promise<Response> {
  const requestUrl = new URL(request.url);

  if (request.method === 'OPTIONS') {
    if (getRequestOrigin(request) && !isBrowserOriginAllowed(request, context)) {
      return json(request, context, 403, { message: 'Origin is not allowed.' });
    }

    return json(request, context, 204, {});
  }

  if (request.method === 'GET' && requestUrl.pathname === '/') {
    return json(request, context, 200, {
      ok: true,
      service: 'xerolas-backend',
      message: 'Xerolas backend is running.',
      routes: {
        health: '/health',
        session: '/api/v1/session',
        analyze: '/api/v1/analyze',
        analyzeStream: '/api/v1/analyze/stream'
      }
    });
  }

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    return json(request, context, 200, {
      ok: true,
      tlsEnabled: Boolean(context.config.tlsCertPath && context.config.tlsKeyPath),
      geminiConfigured: Boolean(context.config.geminiApiKey),
      geminiModel: context.config.geminiModel,
      geminiFallbackModel: context.config.geminiFallbackModel,
      openRouterConfigured: Boolean(context.config.openRouterApiKey),
      openRouterModel: context.config.openRouterModel,
      openRouterWebSearchEnabled: context.config.openRouterEnableWebSearch,
      sessionConfigured: Boolean(context.config.sessionSecret),
      replayProtectionMode: context.replayProtector.mode
    });
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/session') {
    return handleSessionBootstrap(request, context);
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/analyze') {
    return handleAnalyze(request, context);
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/analyze/stream') {
    return handleAnalyzeStream(request, context);
  }

  return json(request, context, 404, { message: 'Not found.' });
}
