export interface CloudflareWorkerBindings {
  GEMINI_API_KEY?: string;
  CONTEXT_AI_GEMINI_API_KEY?: string;
  CONTEXT_AI_GEMINI_MODEL?: string;
  CONTEXT_AI_GEMINI_FALLBACK_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  CONTEXT_AI_OPENROUTER_API_KEY?: string;
  CONTEXT_AI_OPENROUTER_MODEL?: string;
  CONTEXT_AI_OPENROUTER_ENABLE_WEB_SEARCH?: string;
  CONTEXT_AI_SESSION_SECRET?: string;
  CONTEXT_AI_SESSION_TTL_SECONDS?: string;
  CONTEXT_AI_ALLOWED_ORIGINS?: string;
  CONTEXT_AI_SESSION_RATE_LIMIT_PER_MINUTE?: string;
  CONTEXT_AI_ANALYZE_RATE_LIMIT_PER_MINUTE?: string;
  REPLAY_NONCE_COORDINATOR?: DurableObjectNamespaceLike;
}

export interface DurableObjectStubLike {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  getByName(name: string): DurableObjectStubLike;
}

export interface ReplayNonceConsumeInput {
  sessionId: string;
  nonce: string;
  nowMs: number;
  expiresAtMs: number;
}

export interface RateLimitInput {
  key: string;
  nowMs: number;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  accepted: boolean;
  retryAfterSeconds: number;
}

export interface ReplayProtector {
  mode: 'memory' | 'durable-object';
  consume(input: ReplayNonceConsumeInput): Promise<boolean>;
}

export interface RateLimiter {
  mode: 'memory' | 'durable-object';
  check(input: RateLimitInput): Promise<RateLimitResult>;
}

export interface ServerConfig {
  host: string;
  port: number;
  geminiApiKey: string;
  geminiModel: string;
  geminiFallbackModel: string;
  openRouterApiKey: string;
  openRouterModel: string;
  openRouterEnableWebSearch: boolean;
  sessionSecret: string;
  sessionTtlSeconds: number;
  allowedOrigins: string[];
  sessionRateLimitPerMinute: number;
  analyzeRateLimitPerMinute: number;
  tlsCertPath: string;
  tlsKeyPath: string;
}

export interface BackendRuntimeContext {
  config: ServerConfig;
  replayProtector: ReplayProtector;
  rateLimiter: RateLimiter;
}

class InMemoryReplayProtector implements ReplayProtector {
  mode: 'memory' = 'memory';
  private readonly sessions = new Map<string, Map<string, number>>();

  async consume(input: ReplayNonceConsumeInput): Promise<boolean> {
    const sessionEntries = this.sessions.get(input.sessionId) ?? new Map<string, number>();
    const nextEntries = new Map<string, number>();

    sessionEntries.forEach((expiry, nonce) => {
      if (expiry > input.nowMs) {
        nextEntries.set(nonce, expiry);
      }
    });

    if (nextEntries.has(input.nonce)) {
      this.sessions.set(input.sessionId, nextEntries);
      return false;
    }

    nextEntries.set(input.nonce, input.expiresAtMs);
    this.sessions.set(input.sessionId, nextEntries);
    return true;
  }
}

class InMemoryRateLimiter implements RateLimiter {
  mode: 'memory' = 'memory';
  private readonly buckets = new Map<string, { count: number; resetAtMs: number }>();

  async check(input: RateLimitInput): Promise<RateLimitResult> {
    if (input.limit <= 0) {
      return { accepted: true, retryAfterSeconds: 0 };
    }

    const existing = this.buckets.get(input.key);
    const resetAtMs = existing && existing.resetAtMs > input.nowMs
      ? existing.resetAtMs
      : input.nowMs + input.windowMs;
    const count = existing && existing.resetAtMs > input.nowMs ? existing.count : 0;

    if (count >= input.limit) {
      return {
        accepted: false,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - input.nowMs) / 1000))
      };
    }

    this.buckets.set(input.key, { count: count + 1, resetAtMs });
    return { accepted: true, retryAfterSeconds: 0 };
  }
}

class DurableObjectReplayProtector implements ReplayProtector {
  mode: 'durable-object' = 'durable-object';
  private readonly namespace: DurableObjectNamespaceLike;

  constructor(namespace: DurableObjectNamespaceLike) {
    this.namespace = namespace;
  }

  async consume(input: ReplayNonceConsumeInput): Promise<boolean> {
    const stub = this.namespace.getByName(input.sessionId);
    const response = await stub.fetch('https://internal/consume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });

    if (response.status === 204) {
      return true;
    }

    if (response.status === 409) {
      return false;
    }

    const message = (await response.text()).trim();
    throw new Error(message || 'Replay protection request failed.');
  }
}

class DurableObjectRateLimiter implements RateLimiter {
  mode: 'durable-object' = 'durable-object';
  private readonly namespace: DurableObjectNamespaceLike;

  constructor(namespace: DurableObjectNamespaceLike) {
    this.namespace = namespace;
  }

  async check(input: RateLimitInput): Promise<RateLimitResult> {
    const stub = this.namespace.getByName(input.key);
    const response = await stub.fetch('https://internal/rate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });

    if (response.status === 204) {
      return { accepted: true, retryAfterSeconds: 0 };
    }

    if (response.status === 429) {
      const retryAfterSeconds = Number.parseInt(response.headers.get('Retry-After') ?? '60', 10);
      return {
        accepted: false,
        retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 60
      };
    }

    const message = (await response.text()).trim();
    throw new Error(message || 'Rate limit request failed.');
  }
}

function createReplayProtector(
  namespace?: DurableObjectNamespaceLike | null
): ReplayProtector {
  if (namespace) {
    return new DurableObjectReplayProtector(namespace);
  }

  return new InMemoryReplayProtector();
}

function createRateLimiter(
  namespace?: DurableObjectNamespaceLike | null
): RateLimiter {
  if (namespace) {
    return new DurableObjectRateLimiter(namespace);
  }

  return new InMemoryRateLimiter();
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

export function createBackendRuntimeContext(
  config: ServerConfig,
  replayProtector?: ReplayProtector,
  rateLimiter?: RateLimiter
): BackendRuntimeContext {
  return {
    config,
    replayProtector: replayProtector ?? createReplayProtector(),
    rateLimiter: rateLimiter ?? createRateLimiter()
  };
}

export function createWorkerRuntimeContext(
  bindings: CloudflareWorkerBindings
): BackendRuntimeContext {
  return createBackendRuntimeContext({
    host: '127.0.0.1',
    port: 8787,
    geminiApiKey: (
      bindings.GEMINI_API_KEY ??
      bindings.CONTEXT_AI_GEMINI_API_KEY ??
      ''
    )
      .toString()
      .trim(),
    geminiModel: (bindings.CONTEXT_AI_GEMINI_MODEL ?? 'gemini-2.5-flash').toString().trim(),
    geminiFallbackModel: (bindings.CONTEXT_AI_GEMINI_FALLBACK_MODEL ?? 'gemini-2.5-flash-lite')
      .toString()
      .trim(),
    openRouterApiKey: (
      bindings.OPENROUTER_API_KEY ??
      bindings.CONTEXT_AI_OPENROUTER_API_KEY ??
      ''
    )
      .toString()
      .trim(),
    openRouterModel: (bindings.CONTEXT_AI_OPENROUTER_MODEL ?? 'openrouter/free').toString().trim(),
    openRouterEnableWebSearch: (bindings.CONTEXT_AI_OPENROUTER_ENABLE_WEB_SEARCH ?? '')
      .toString()
      .trim()
      .toLowerCase() === 'true',
    sessionSecret: (bindings.CONTEXT_AI_SESSION_SECRET ?? '').toString().trim(),
    sessionTtlSeconds: Math.max(
      60,
      Number.parseInt((bindings.CONTEXT_AI_SESSION_TTL_SECONDS ?? '900').toString().trim(), 10) ||
        900
    ),
    allowedOrigins: parseCsv(bindings.CONTEXT_AI_ALLOWED_ORIGINS),
    sessionRateLimitPerMinute: parsePositiveInteger(
      bindings.CONTEXT_AI_SESSION_RATE_LIMIT_PER_MINUTE,
      12
    ),
    analyzeRateLimitPerMinute: parsePositiveInteger(
      bindings.CONTEXT_AI_ANALYZE_RATE_LIMIT_PER_MINUTE,
      30
    ),
    tlsCertPath: '',
    tlsKeyPath: ''
  }, createReplayProtector(bindings.REPLAY_NONCE_COORDINATOR), createRateLimiter(bindings.REPLAY_NONCE_COORDINATOR));
}
