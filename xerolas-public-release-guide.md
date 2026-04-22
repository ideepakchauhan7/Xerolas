# Xerolas Free Public Release Guide

This guide is the public release runbook for Xerolas using only free infrastructure:

- Public GitHub repo: `https://github.com/ideepakchauhan7/Xerolas.git`
- Public GitHub Releases for installers and update metadata
- Free Vercel subdomain for the landing page
- Cloudflare Worker at `https://xerolas.ideepakchauhan7.workers.dev`
- No paid services, no custom domain, no license flow

## Release architecture

### Desktop app

- Electron app packaged with `electron-builder`
- Auto-update through `electron-updater`
- Packaged app points to:
  - `updateGithubOwner = ideepakchauhan7`
  - `updateGithubRepo = Xerolas`
  - `backendBaseUrl = https://xerolas.ideepakchauhan7.workers.dev`

### Backend

- Cloudflare Worker named `xerolas`
- Public URL:

```text
https://xerolas.ideepakchauhan7.workers.dev
```

- Holds Gemini API key and session secret as Worker secrets

### Public downloads

- Installers live in GitHub Releases for `ideepakchauhan7/Xerolas`
- Landing page is the static `landing/` directory deployed to a free `*.vercel.app` subdomain
- No custom domain is required

## What gets published

Each public release should publish:

- Windows `.exe`
- macOS `.dmg`
- Linux `.AppImage`
- Linux `.deb`
- updater metadata such as `latest.yml`

GitHub Releases are the single public source of truth for all release artifacts.

## One-time setup

### 1. GitHub repo

Use this public repo:

```text
https://github.com/ideepakchauhan7/Xerolas.git
```

### 2. Cloudflare Worker secrets

Set the required Worker secrets:

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put CONTEXT_AI_SESSION_SECRET
```

Optional variables:

- `CONTEXT_AI_GEMINI_MODEL`
- `CONTEXT_AI_GEMINI_FALLBACK_MODEL`
- `CONTEXT_AI_SESSION_TTL_SECONDS`

### 3. Vercel

Deploy the static `landing/` site to a free Vercel project and use the default `*.vercel.app` URL.

Do not configure:

- custom domains
- paid Vercel features
- private release proxies

## Release flow

### Step 1 — Update version

Update the desktop app version in `package.json`.

### Step 2 — Push a release tag

Create and push a tag such as:

```bash
git tag v0.1.0
git push origin v0.1.0
```

### Step 3 — GitHub Actions builds the release

The release workflow runs on the tag and builds artifacts on:

- Ubuntu
- Windows
- macOS

The workflow uploads all generated installers and updater metadata to the matching GitHub Release.

### Step 4 — Landing page reads the latest release

The landing page calls the GitHub Releases API for:

```text
ideepakchauhan7/Xerolas
```

It automatically shows:

- latest version
- release notes
- download links for Windows / macOS / Linux

### Step 5 — Installed apps update automatically

Packaged Xerolas builds check public GitHub Releases on launch and download updates in the background through `electron-updater`.

## Immediate Worker cutover

This release plan assumes a hard cutover from the old `context-ai` Worker name to the new `xerolas` Worker name.

That means:

- all new docs point only to `xerolas.ideepakchauhan7.workers.dev`
- example config points only to `xerolas.ideepakchauhan7.workers.dev`
- packaged defaults point only to `xerolas.ideepakchauhan7.workers.dev`
- the release repo points only to `ideepakchauhan7/Xerolas`

Older builds that still point at the old Worker URL are not preserved by this guide.

## Required verification before each public release

Run:

```bash
npm run typecheck
npm run build
npx electron-builder --dir
HOME=/tmp XDG_CONFIG_HOME=/tmp npx wrangler deploy --dry-run
```

Then verify:

1. `https://xerolas.ideepakchauhan7.workers.dev/health` responds
2. the landing page pulls the latest GitHub Release from `ideepakchauhan7/Xerolas`
3. the packaged config points at:
   - `updateGithubOwner = ideepakchauhan7`
   - `updateGithubRepo = Xerolas`
   - `backendBaseUrl = https://xerolas.ideepakchauhan7.workers.dev`

## Free-stack summary

- Desktop shell: Electron
- Backend: Cloudflare Workers
- AI: Gemini free-tier models
- Installers: GitHub Releases
- Auto-update: `electron-updater` + GitHub Releases
- Public site: Vercel `*.vercel.app`

Total required paid services: none.
