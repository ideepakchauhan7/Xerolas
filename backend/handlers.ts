import type { BackendRuntimeContext } from './config';
import { analyzeImageWithGemini } from './gemini';
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
  imageMimeType: string;
  imageBase64Data: string;
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

    const imageMimeType = image.type?.trim() || 'image/png';
    const imageBase64Data = base64EncodeBytes(new Uint8Array(await image.arrayBuffer()));

    return {
      quickActionId,
      promptTemplate,
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
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!match) {
    throw new Error('A captured image data URL is required.');
  }

  return {
    quickActionId,
    promptTemplate,
    imageMimeType: match[1],
    imageBase64Data: match[2]
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
  if (!context.config.geminiApiKey) {
    return json(503, {
      message: 'Configure GEMINI_API_KEY before using analysis.'
    });
  }

  try {
    await authorizeAnalyzeRequest(request, context);
    const payload = await readAnalyzeRequest(request);
    const analysis = await analyzeImageWithGemini({
      apiKey: context.config.geminiApiKey,
      primaryModel: context.config.geminiModel,
      fallbackModel: context.config.geminiFallbackModel,
      promptTemplate: payload.promptTemplate,
      imageMimeType: payload.imageMimeType,
      imageBase64Data: payload.imageBase64Data
    });

    return json(200, {
      text: analysis.text,
      provider: 'gemini',
      model: analysis.model,
      quickActionId: payload.quickActionId,
      usedFallback: analysis.usedFallback
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Gemini request failed.';
    const status =
      message.includes('temporarily waiting for Gemini capacity')
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
    return json(status, {
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
        analyze: '/api/v1/analyze'
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

  return json(404, { message: 'Not found.' });
}
