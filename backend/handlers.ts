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
  stream: AsyncGenerator<ProviderStreamEvent>;
  getGrounding: () => { groundingUsed: boolean; sources: SourceLink[] };
}

function json(status: number, payload: JsonRecord): Response {
  return new Response(status === 204 ? null : `${JSON.stringify(payload)}\n`, {
    status,
    headers: {
      'Access-Control-Allow-Headers': `Content-Type, ${SESSION_HEADER}, ${NONCE_HEADER}, ${TIMESTAMP_HEADER}`,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function sseHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Headers': `Content-Type, ${SESSION_HEADER}, ${NONCE_HEADER}, ${TIMESTAMP_HEADER}`,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8'
  };
}

function encodeSseEvent(event: string, payload: JsonRecord): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  const body = await request.text();
  if (!body.trim()) {
    return {};
  }

  return JSON.parse(body) as JsonRecord;
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
    const quickActionId =
      typeof formData.get('quickActionId') === 'string' && formData.get('quickActionId')
        ? (formData.get('quickActionId') as string).trim()
        : 'describe';
    const promptTemplate =
      typeof formData.get('promptTemplate') === 'string' && formData.get('promptTemplate')
        ? (formData.get('promptTemplate') as string).trim()
        : 'Answer the most useful question about this selected content. Focus on the main subject, solve or explain the visible content when possible, ignore browser or app chrome unless it matters, and keep the answer concise, grounded, and practical. Use plain text only.';
    const image = formData.get('image');

    if (!(image instanceof File)) {
      throw new Error('A captured image file is required.');
    }

    const question =
      typeof formData.get('question') === 'string' && formData.get('question')
        ? (formData.get('question') as string).trim()
        : undefined;
    const imageMimeType = image.type?.trim() || 'image/png';
    const imageBase64Data = base64EncodeBytes(new Uint8Array(await image.arrayBuffer()));

    return {
      quickActionId,
      promptTemplate,
      question,
      imageMimeType,
      imageBase64Data
    };
  }

  const body = await readJsonBody(request);
  const quickActionId =
    typeof body.quickActionId === 'string' && body.quickActionId.trim()
      ? body.quickActionId.trim()
      : 'describe';
  const promptTemplate =
    typeof body.promptTemplate === 'string' && body.promptTemplate.trim()
      ? body.promptTemplate.trim()
      : 'Answer the most useful question about this selected content. Focus on the main subject, solve or explain the visible content when possible, ignore browser or app chrome unless it matters, and keep the answer concise, grounded, and practical. Use plain text only.';
  const question =
    typeof body.question === 'string' && body.question.trim() ? body.question.trim() : undefined;
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!match) {
    throw new Error('A captured image data URL is required.');
  }

  return {
    quickActionId,
    promptTemplate,
    question,
    imageMimeType: match[1],
    imageBase64Data: match[2]
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
      : message.includes('captured image')
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
        imageBase64Data: payload.imageBase64Data
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
        imageBase64Data: payload.imageBase64Data
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
    return json(503, {
      message: 'Configure CONTEXT_AI_SESSION_SECRET before using session bootstrap.'
    });
  }

  const body = await readJsonBody(request);
  const appVersion =
    typeof body.appVersion === 'string' && body.appVersion.trim() ? body.appVersion.trim() : 'unknown';
  const platform =
    typeof body.platform === 'string' && body.platform.trim() ? body.platform.trim() : 'unknown';
  const session = issueSessionToken(context, {
    appVersion,
    platform
  });

  return json(200, {
    token: session.token,
    expiresAt: session.expiresAt,
    expiresInSeconds: session.expiresInSeconds
  });
}

async function handleAnalyze(
  request: Request,
  context: BackendRuntimeContext
): Promise<Response> {
  if (!hasAnalysisProvider(context)) {
    return json(503, {
      message: getMissingProviderMessage()
    });
  }

  try {
    await authorizeAnalyzeRequest(request, context);
    const payload = await readAnalyzeRequest(request);
    const analysis = await analyzeWithConfiguredProviders(context, payload);

    return json(200, {
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
    return json(getAnalyzeErrorStatus(message), {
      message: error instanceof Error ? error.message : 'The Gemini request failed.'
    });
  }
}

async function handleAnalyzeStream(
  request: Request,
  context: BackendRuntimeContext
): Promise<Response> {
  if (!hasAnalysisProvider(context)) {
    return json(503, {
      message: getMissingProviderMessage()
    });
  }

  try {
    await authorizeAnalyzeRequest(request, context);
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
      headers: sseHeaders()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Gemini request failed.';
    return json(getAnalyzeErrorStatus(message), {
      message: error instanceof Error ? error.message : 'The Gemini request failed.'
    });
  }
}

export async function handleBackendRequest(
  request: Request,
  context: BackendRuntimeContext
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return json(204, {});
  }

  const requestUrl = new URL(request.url);

  if (request.method === 'GET' && requestUrl.pathname === '/') {
    return json(200, {
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
    return json(200, {
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

  return json(404, { message: 'Not found.' });
}
