# Xerolas Realistic Hardening Guide

Xerolas is an open-source Electron desktop app that talks to a Cloudflare Worker backend. That means the goal is not to make the client “impossible to reverse engineer.” The goal is to:

- raise the cost of casual tampering
- keep provider secrets and sensitive policy server-side
- make replay and abuse harder
- document honestly what is and is not protected

## Current threat model

The practical attacks against Xerolas are:

1. Extracting packaged JavaScript from `app.asar`
2. Running the packaged app with a debugger or inspector attached
3. Patching packaged resources to alter behavior
4. Replaying or scripting backend requests against the Cloudflare Worker
5. Abusing public backend endpoints to consume Gemini capacity

Because Xerolas is open source, a determined attacker can still inspect the client. The hardening model is therefore:

- protect secrets by never shipping them
- keep sensitive decisions on the backend
- use tamper checks and packaged hardening to raise client-side effort
- use short-lived backend sessions plus replay protection to raise network-side effort

## Protections Xerolas uses

### 1. Production obfuscation

Desktop production bundles are obfuscated before packaging. The profile is intentionally moderate and stability-focused:

- control-flow flattening is limited
- dead-code injection is disabled
- debug-protection obfuscator tricks are not used because they are brittle in Electron

This raises the effort to casually read packaged JavaScript without making the build fragile.

### 2. Packaged integrity verification

The packaged app verifies an integrity manifest on startup.

Current coverage includes:

- `app.asar`
- packaged client config
- unpacked app-controlled resources under `app.asar.unpacked/`

If a tracked packaged resource is missing or modified, startup fails.

### 3. Runtime security checks

In packaged builds, Xerolas fails fast when it detects:

- inspector/debug flags
- debugger/tracer attachment on Linux
- obvious Linux VM hints

There is still an internal override for trusted testing:

```bash
CONTEXT_AI_ALLOW_DEBUG=1
```

That override is for internal debugging only and should never be used in production release instructions.

### 4. Production window hardening

Packaged renderer windows disable DevTools and deny new window creation. This reduces the easy path for live UI inspection without affecting local development.

### 5. HTTPS-only remote backend

The desktop app allows plain HTTP only for local development targets like `127.0.0.1` and `localhost`. Remote backends must use HTTPS.

### 6. Server-signed backend sessions

The Cloudflare Worker now exposes:

- `POST /api/v1/session`
- `POST /api/v1/analyze`

The desktop client first obtains a short-lived server-signed session token. Each analyze request then sends:

- session token
- timestamp
- cryptographic nonce

The Worker verifies the token and rejects stale timestamps.

### 7. Replay protection with Durable Objects

Replay protection is enforced server-side. Xerolas uses a Durable Object-backed nonce coordinator so a nonce can only be accepted once for a given session.

Rejected cases include:

- missing trust headers
- expired session token
- reused nonce
- stale or future-skewed timestamp outside the allowed window

This does not make the client private, but it does make network replay and automated abuse meaningfully harder.

## Explicitly out of scope for Xerolas v1

The following are intentionally not part of the current Xerolas product:

- license binding or activation keys
- device fingerprint gating
- certificate pinning to Cloudflare-managed certificates
- encrypted ASAR with runtime decryption
- native C++ addons for core trust logic
- claims that the app is “practically impossible to reverse engineer”

These either conflict with the current install-and-use product model, add high platform risk, or do not fit an open-source client.

## Why some common ideas are rejected here

### “Just encrypt the ASAR”

Encrypted ASAR schemes add a lot of complexity, still require a runtime key path, and do not fit well with an open-source Electron client. Xerolas uses standard ASAR plus integrity verification and obfuscation instead.

### “Pin the Cloudflare certificate”

Cloudflare manages certificates and rotates them. Hard certificate pinning would create brittle shipped installs and emergency rebuilds. Xerolas relies on standard HTTPS plus signed sessions and replay protection instead.

### “Move everything into a native addon”

That only makes sense if the client itself is the trust boundary. Xerolas is designed so the backend is the trust boundary. Sensitive controls belong on the server:

- provider choice
- abuse controls
- replay policy
- token issuance
- request acceptance rules

## Release expectations

The current release hardening story is:

- obfuscated desktop bundle
- ASAR packaging
- integrity verification
- runtime anti-debug checks
- HTTPS-only remote backend
- signed backend sessions and replay protection

Still pending for stronger production release posture:

- Windows code signing
- macOS notarization
- more formal release verification across Windows/macOS/Linux

Unsigned builds remain easier to tamper with and will still show platform trust warnings.

## Honest limits

- Open source means the client can still be studied.
- Obfuscation slows inspection; it does not prevent it.
- Runtime anti-debug and VM checks are heuristic and bypassable.
- Anyone can still write their own unofficial client against the public backend shape unless the backend adds stricter abuse controls.
- Backend session tokens are short-lived bearer-style credentials, not user identity.

## Bottom line

Xerolas protects what matters in the current product model:

- secrets stay server-side
- packaged tampering is detected
- easy live inspection is reduced
- replayed backend traffic is rejected

That is a realistic, maintainable hardening strategy for an open-source, install-and-use Electron app backed by Cloudflare Workers.
