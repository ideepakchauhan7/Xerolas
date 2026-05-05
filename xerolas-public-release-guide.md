# Xerolas Public Release Guide

This guide is the release runbook for a public-source Xerolas build that does not ship Xerolas-owned AI provider keys.

## Release Architecture

### Desktop App

- Electron app packaged with `electron-builder`.
- Users add their own Anthropic, OpenAI, Gemini, or OpenRouter key in Settings.
- API keys are stored locally with Electron `safeStorage`; saved keys are never returned to the renderer.
- Web search is off by default and can be enabled explicitly in Settings when the selected provider/model supports it.
- Auto-update uses `electron-updater` and GitHub Releases in the public `Xerolas` repo.

Packaged app defaults:

- `updateGithubOwner = ideepakchauhan7`
- `updateGithubRepo = Xerolas`
- no default `backendBaseUrl`

### Optional Self-Hosted Gateway

The Cloudflare Worker remains available for self-hosted gateway deployments, but it is not the default public-source path.

Use a gateway only when you intentionally configure one through:

- `build/app-config.json`
- `config/app-config.local.json`
- `CONTEXT_AI_BACKEND_URL`
- `CONTEXT_AI_GATEWAY_URL`

If a gateway is configured, it must own its provider secrets and session/replay protection. Do not commit gateway secrets.

### Public Releases

- Installers live in GitHub Releases for `ideepakchauhan7/Xerolas`.
- The landing page is the static `landing/` directory deployed to a free `*.vercel.app` subdomain.
- No custom domain or paid release infrastructure is required.

## What Gets Published

Each public release should publish:

- Windows `.exe`
- macOS `.dmg`
- Linux `.snap` for Snap Store / Ubuntu App Center distribution
- Linux `.AppImage` as a manual portable package
- Linux `.deb` as a manual package for users who specifically need Debian packaging
- updater metadata such as `latest.yml`

GitHub Releases are the public source of truth for direct-download artifacts. Snap Store publishing uses the generated `.snap` artifact as the store submission package.

## One-Time Setup

### 1. GitHub Repo

Public source and release repo:

```text
https://github.com/ideepakchauhan7/Xerolas.git
```

The repo must be publicly reachable. If it returns `404` in an incognito window, the landing page downloads and update checks will fail for public users.

### 2. Provider Keys

For the default public app, provider keys are user-owned and entered in Settings. Do not add maintainer-owned AI keys to the packaged desktop app.

For an optional self-hosted Worker gateway, set secrets only in Cloudflare:

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put CONTEXT_AI_SESSION_SECRET
```

Optional gateway fallback settings:

- `OPENROUTER_API_KEY`
- `CONTEXT_AI_GEMINI_MODEL`
- `CONTEXT_AI_GEMINI_FALLBACK_MODEL`
- `CONTEXT_AI_OPENROUTER_MODEL`
- `CONTEXT_AI_OPENROUTER_ENABLE_WEB_SEARCH`
- `CONTEXT_AI_ALLOWED_ORIGINS`
- `CONTEXT_AI_SESSION_RATE_LIMIT_PER_MINUTE`
- `CONTEXT_AI_ANALYZE_RATE_LIMIT_PER_MINUTE`

### 3. GitHub Releases

The release workflow publishes installers into the same `ideepakchauhan7/Xerolas` repo. It uses the built-in GitHub Actions token with `contents: write`, so no cross-repo release token is required.

### 4. Vercel

Deploy the repo to a free Vercel project and either:

- set the Root Directory to `landing`, or
- keep the repo root and use the included `vercel.json` config.

Use the default `*.vercel.app` URL only.

## Release Flow

1. Update the desktop app version in `package.json`.
2. Run verification locally.
3. Create and push a release tag such as `v0.1.30`.
4. GitHub Actions builds artifacts on Ubuntu, Windows, and macOS.
5. The workflow uploads installers and updater metadata to `ideepakchauhan7/Xerolas`.
6. The landing page reads the latest public GitHub Release.
7. Installed apps update through public GitHub Releases.

## Required Verification Before Public Release

Run:

```bash
npm run typecheck
npm run build
npx electron-builder --dir
npm audit --audit-level=moderate
```

Then verify:

1. `build/app-config.json` contains update repo defaults but no default `backendBaseUrl`.
2. A fresh app install without a key opens Settings and fails capture gracefully without sending a screenshot.
3. Saving a provider key does not put the full key in `settings.json`.
4. `rg` finds no real provider keys in current files.
5. `git log -G` finds no real provider keys in history; rotate any key that ever touched git.
6. Landing downloads still point at `ideepakchauhan7/Xerolas`.

## Free-Stack Summary

- Desktop shell: Electron
- AI provider: user-selected BYOK provider
- Optional gateway: Cloudflare Worker
- Installers: GitHub Releases
- Auto-update: `electron-updater` + GitHub Releases
- Public site: Vercel `*.vercel.app`

Total required paid services for Xerolas infrastructure: none. Users are responsible for their own provider account limits, billing rules, and API usage.
