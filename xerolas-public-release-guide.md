# Xerolas Free Public Release Guide

This guide is the public release runbook for Xerolas using only free infrastructure:

- Private source repo: `ideepakchauhan7/Xerolas`
- Separate public downloads repo: `ideepakchauhan7/Xerolas-downloads`
- Public GitHub Releases for installers and update metadata from the downloads repo
- Free Vercel subdomain for the landing page
- Cloudflare Worker at `https://xerolas.ideepakchauhan7.workers.dev`
- No paid services, no custom domain, no license flow
- Source code remains private

## Release architecture

### Desktop app

- Electron app packaged with `electron-builder`
- Auto-update through `electron-updater`
- Packaged app points to:
  - `updateGithubOwner = ideepakchauhan7`
  - `updateGithubRepo = Xerolas-downloads`
  - `backendBaseUrl = https://xerolas.ideepakchauhan7.workers.dev`

### Backend

- Cloudflare Worker named `xerolas`
- Public URL:

```text
https://xerolas.ideepakchauhan7.workers.dev
```

- Holds Gemini API key and session secret as Worker secrets

### Public downloads

- Installers live in GitHub Releases for `ideepakchauhan7/Xerolas-downloads`
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

Use this private source repo for development and CI:

```text
https://github.com/ideepakchauhan7/Xerolas.git
```

Create this separate public downloads repo for public installers and updater metadata:

```text
https://github.com/ideepakchauhan7/Xerolas-downloads
```

Important: the downloads repo must be publicly reachable. If `https://github.com/ideepakchauhan7/Xerolas-downloads` returns `404` when opened in an incognito window, the landing page, GitHub Releases downloads, and auto-update checks will all fail for public users even though the source repo can remain private.

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

### 3. GitHub token for cross-repo releases

Add a repository secret named `DOWNLOADS_REPO_TOKEN` to the private source repo. Use a personal access token or fine-grained token with `contents: write` access to `ideepakchauhan7/Xerolas-downloads` so GitHub Actions in the private source repo can create releases in the public downloads repo.

### 4. Vercel

Deploy the repo to a free Vercel project and either:

- set the Root Directory to `landing`, or
- keep the repo root and use the included `vercel.json` rewrite config

Use the default `*.vercel.app` URL only.

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

The release workflow runs in the private source repo on the tag and builds artifacts on:

- Ubuntu
- Windows
- macOS

The workflow uploads all generated installers and updater metadata to the matching GitHub Release in `ideepakchauhan7/Xerolas-downloads`.

### Step 4 — Landing page reads the latest release

The landing page calls the GitHub Releases API for:

```text
ideepakchauhan7/Xerolas-downloads
```

It automatically shows:

- latest version
- release notes
- download links for Windows / macOS / Linux

### Step 5 — Installed apps update automatically

Packaged Xerolas builds check public GitHub Releases in `ideepakchauhan7/Xerolas-downloads` on launch and download updates in the background through `electron-updater`.

## Immediate Worker cutover

This release plan assumes a hard cutover from the old `context-ai` Worker name to the new `xerolas` Worker name.

That means:

- all new docs point only to `xerolas.ideepakchauhan7.workers.dev`
- example config points only to `xerolas.ideepakchauhan7.workers.dev`
- packaged defaults point only to `xerolas.ideepakchauhan7.workers.dev`
- the release repo points only to `ideepakchauhan7/Xerolas-downloads`

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
2. the landing page pulls the latest GitHub Release from `ideepakchauhan7/Xerolas-downloads`
3. the packaged config points at:
   - `updateGithubOwner = ideepakchauhan7`
   - `updateGithubRepo = Xerolas-downloads`
   - `backendBaseUrl = https://xerolas.ideepakchauhan7.workers.dev`

## Free-stack summary

- Desktop shell: Electron
- Backend: Cloudflare Workers
- AI: Gemini free-tier models
- Installers: GitHub Releases
- Auto-update: `electron-updater` + GitHub Releases
- Public site: Vercel `*.vercel.app`

Total required paid services: none.

Assumption used in this guide: the public downloads repo is `ideepakchauhan7/Xerolas-downloads`. If you choose a different public repo name, update the workflow, landing page, and packaged app defaults together.
