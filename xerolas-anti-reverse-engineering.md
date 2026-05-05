# Xerolas Realistic Hardening Guide

Xerolas is an open-source Electron desktop app with a local BYOK provider model and an optional self-hosted Cloudflare Worker gateway. That means the goal is not to make the client “impossible to reverse engineer.” The goal is to:

- raise the cost of casual tampering
- avoid shipping Xerolas-owned provider secrets
- keep user API keys encrypted locally when possible
- make optional gateway replay and abuse harder
- document honestly what is and is not protected

## Current threat model

The practical attacks against Xerolas are:

1. Extracting packaged JavaScript from `app.asar`
2. Running the packaged app with a debugger or inspector attached
3. Patching packaged resources to alter behavior
4. Extracting a user-owned API key from a compromised local account
5. Replaying or scripting requests against an optional self-hosted gateway
6. Abusing public gateway endpoints when a maintainer chooses to run one

Because Xerolas is open source, a determined attacker can still inspect the client. The hardening model is therefore:

- protect Xerolas-owned secrets by not shipping them
- store user BYOK credentials outside normal settings with OS encryption
- keep gateway abuse controls on the gateway when one is configured
- use tamper checks and packaged hardening to raise client-side effort
- use short-lived gateway sessions plus replay protection to raise network-side effort for gateway deployments

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

### 5. BYOK credential isolation

The default public app does not include a Xerolas-owned provider key. Users configure their own provider key in Settings.

Current credential rules:

- saved keys are stored outside `settings.json`
- Electron `safeStorage` is used when OS encryption is available
- the renderer receives only redacted status such as provider, configured state, and last four characters
- production builds refuse to persist keys if OS encryption is unavailable
- plaintext key persistence is development-only behind `XEROLAS_ALLOW_PLAINTEXT_KEYS=1`

This protects against accidental source leaks and packaged-key extraction. It does not protect a key from malware or a fully compromised user account.

### 6. HTTPS-only remote gateway

The desktop app allows plain HTTP only for local development targets like `127.0.0.1` and `localhost`. Remote self-hosted gateways must use HTTPS.

### 7. Server-signed gateway sessions

When a Cloudflare Worker gateway is configured, it exposes:

- `POST /api/v1/session`
- `POST /api/v1/analyze`

The desktop client first obtains a short-lived server-signed session token. Each gateway analyze request then sends:

- session token
- timestamp
- cryptographic nonce

The Worker verifies the token and rejects stale timestamps.

### 8. Replay protection with Durable Objects

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

That only makes sense if the client itself is the trust boundary. Xerolas is designed so no Xerolas-owned provider secret lives in the client. If a self-hosted gateway is used, sensitive gateway controls belong on that gateway:

- provider secret storage
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
- local BYOK key storage through OS encryption
- HTTPS-only remote gateway when configured
- signed gateway sessions and replay protection for optional Worker deployments

Still pending for stronger production release posture:

- Windows code signing
- macOS notarization
- more formal release verification across Windows/macOS/Linux

Unsigned builds remain easier to tamper with and will still show platform trust warnings.

## Honest limits

- Open source means the client can still be studied.
- Obfuscation slows inspection; it does not prevent it.
- Runtime anti-debug and VM checks are heuristic and bypassable.
- User-owned API keys are still sensitive local secrets; Xerolas cannot protect them from malware or a compromised OS account.
- Anyone can still write their own unofficial client against a public gateway shape unless that gateway adds stricter abuse controls.
- Gateway session tokens are short-lived bearer-style credentials, not user identity.

## Bottom line

Xerolas protects what matters in the current product model:

- Xerolas-owned provider secrets are not shipped
- user keys are stored outside normal settings with OS encryption when available
- packaged tampering is detected
- easy live inspection is reduced
- replayed gateway traffic is rejected when a gateway is used

That is a realistic, maintainable hardening strategy for an open-source, install-and-use Electron app with local BYOK providers and optional Cloudflare Workers.
