import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { BackendRuntimeContext } from './config';

export const SESSION_HEADER = 'X-Xerolas-Session';
export const NONCE_HEADER = 'X-Xerolas-Nonce';
export const TIMESTAMP_HEADER = 'X-Xerolas-Timestamp';
const SESSION_TOKEN_VERSION = 'v1';
// Allow real desktop clock drift while nonce replay protection still enforces single-use requests.
const SESSION_CLOCK_SKEW_MS = 5 * 60_000;

export interface SessionClaims {
  v: string;
  sid: string;
  iat: number;
  exp: number;
  appVersion: string;
  platform: string;
}

interface SessionIssueInput {
  appVersion: string;
  platform: string;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function timingSafeMatches(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function sanitizeClientHint(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 80);
}

export function issueSessionToken(
  context: BackendRuntimeContext,
  input: SessionIssueInput,
  nowMs = Date.now()
): { token: string; expiresAt: string; expiresInSeconds: number; claims: SessionClaims } {
  if (!context.config.sessionSecret) {
    throw new Error('Configure CONTEXT_AI_SESSION_SECRET before using session bootstrap.');
  }

  const issuedAtSeconds = Math.floor(nowMs / 1000);
  const expiresInSeconds = Math.max(60, context.config.sessionTtlSeconds);
  const claims: SessionClaims = {
    v: SESSION_TOKEN_VERSION,
    sid: randomUUID(),
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + expiresInSeconds,
    appVersion: sanitizeClientHint(input.appVersion, 'unknown'),
    platform: sanitizeClientHint(input.platform, 'unknown')
  };
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = signPayload(payload, context.config.sessionSecret);

  return {
    token: `${SESSION_TOKEN_VERSION}.${payload}.${signature}`,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    expiresInSeconds,
    claims
  };
}

export function verifySessionToken(
  context: BackendRuntimeContext,
  token: string,
  nowMs = Date.now()
): SessionClaims {
  if (!context.config.sessionSecret) {
    throw new Error('Configure CONTEXT_AI_SESSION_SECRET before using session bootstrap.');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== SESSION_TOKEN_VERSION) {
    throw new Error('The backend session token is invalid.');
  }

  const payload = parts[1];
  const signature = parts[2];
  const expectedSignature = signPayload(payload, context.config.sessionSecret);

  if (!timingSafeMatches(expectedSignature, signature)) {
    throw new Error('The backend session token signature is invalid.');
  }

  let claims: SessionClaims;
  try {
    claims = JSON.parse(base64UrlDecode(payload)) as SessionClaims;
  } catch {
    throw new Error('The backend session token payload is invalid.');
  }

  if (
    claims.v !== SESSION_TOKEN_VERSION ||
    typeof claims.sid !== 'string' ||
    !claims.sid.trim() ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number'
  ) {
    throw new Error('The backend session token payload is malformed.');
  }

  if (claims.exp * 1000 <= nowMs) {
    throw new Error('The backend session token has expired.');
  }

  return claims;
}

export async function authorizeAnalyzeRequest(
  request: Request,
  context: BackendRuntimeContext,
  nowMs = Date.now()
): Promise<SessionClaims> {
  const sessionToken = request.headers.get(SESSION_HEADER)?.trim() ?? '';
  const nonce = request.headers.get(NONCE_HEADER)?.trim() ?? '';
  const timestampHeader = request.headers.get(TIMESTAMP_HEADER)?.trim() ?? '';

  if (!sessionToken || !nonce || !timestampHeader) {
    throw new Error('Missing backend trust headers.');
  }

  const timestampMs = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestampMs)) {
    throw new Error('The backend request timestamp is invalid.');
  }

  if (Math.abs(nowMs - timestampMs) > SESSION_CLOCK_SKEW_MS) {
    throw new Error('The backend request timestamp is too old or too far in the future.');
  }

  const claims = verifySessionToken(context, sessionToken, nowMs);
  const accepted = await context.replayProtector.consume({
    sessionId: claims.sid,
    nonce,
    nowMs,
    expiresAtMs: claims.exp * 1000
  });

  if (!accepted) {
    throw new Error('The backend request nonce has already been used.');
  }

  return claims;
}
