import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createBackendRuntimeContext, type BackendRuntimeContext, type ServerConfig } from './config';

const EPHEMERAL_SESSION_SECRET = randomBytes(32).toString('hex');

function readJsonFile(filePath: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseCsv(value: unknown): string[] {
  return (value ?? '')
    .toString()
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt((value ?? '').toString().trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createNodeServerConfig(): ServerConfig {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const localConfigPath = path.join(projectRoot, 'backend', 'config', 'server.local.json');
  const localConfig = readJsonFile(localConfigPath);

  const host = (process.env.CONTEXT_AI_SERVER_HOST ?? localConfig.host ?? '127.0.0.1')
    .toString()
    .trim();
  const portValue = Number(
    process.env.CONTEXT_AI_SERVER_PORT ?? process.env.PORT ?? localConfig.port ?? 8787
  );

  return {
    host: host || '127.0.0.1',
    port: Number.isFinite(portValue) && portValue > 0 ? portValue : 8787,
    geminiApiKey: (
      process.env.GEMINI_API_KEY ??
      process.env.CONTEXT_AI_GEMINI_API_KEY ??
      localConfig.geminiApiKey ??
      ''
    )
      .toString()
      .trim(),
    geminiModel: (
      process.env.CONTEXT_AI_GEMINI_MODEL ??
      localConfig.geminiModel ??
      'gemini-2.5-flash'
    )
      .toString()
      .trim(),
    geminiFallbackModel: (
      process.env.CONTEXT_AI_GEMINI_FALLBACK_MODEL ??
      localConfig.geminiFallbackModel ??
      'gemini-2.5-flash-lite'
    )
      .toString()
      .trim(),
    openRouterApiKey: (
      process.env.OPENROUTER_API_KEY ??
      process.env.CONTEXT_AI_OPENROUTER_API_KEY ??
      localConfig.openRouterApiKey ??
      ''
    )
      .toString()
      .trim(),
    openRouterModel: (
      process.env.CONTEXT_AI_OPENROUTER_MODEL ??
      localConfig.openRouterModel ??
      'openrouter/free'
    )
      .toString()
      .trim(),
    openRouterEnableWebSearch: (
      process.env.CONTEXT_AI_OPENROUTER_ENABLE_WEB_SEARCH ??
      localConfig.openRouterEnableWebSearch ??
      false
    )
      .toString()
      .trim()
      .toLowerCase() === 'true',
    sessionSecret: (
      process.env.CONTEXT_AI_SESSION_SECRET ??
      localConfig.sessionSecret ??
      EPHEMERAL_SESSION_SECRET
    )
      .toString()
      .trim(),
    sessionTtlSeconds: Math.max(
      60,
      Number(
        process.env.CONTEXT_AI_SESSION_TTL_SECONDS ??
          localConfig.sessionTtlSeconds ??
          900
      ) || 900
    ),
    allowedOrigins: parseCsv(
      process.env.CONTEXT_AI_ALLOWED_ORIGINS ??
        localConfig.allowedOrigins ??
        ''
    ),
    sessionRateLimitPerMinute: parsePositiveInteger(
      process.env.CONTEXT_AI_SESSION_RATE_LIMIT_PER_MINUTE ??
        localConfig.sessionRateLimitPerMinute,
      12
    ),
    analyzeRateLimitPerMinute: parsePositiveInteger(
      process.env.CONTEXT_AI_ANALYZE_RATE_LIMIT_PER_MINUTE ??
        localConfig.analyzeRateLimitPerMinute,
      30
    ),
    tlsCertPath: (process.env.CONTEXT_AI_TLS_CERT_PATH ?? localConfig.tlsCertPath ?? '')
      .toString()
      .trim(),
    tlsKeyPath: (process.env.CONTEXT_AI_TLS_KEY_PATH ?? localConfig.tlsKeyPath ?? '')
      .toString()
      .trim()
  };
}

export function createNodeBackendRuntimeContext(): BackendRuntimeContext {
  return createBackendRuntimeContext(createNodeServerConfig());
}

export function loadNodeServerConfig(): ServerConfig {
  return createNodeServerConfig();
}
