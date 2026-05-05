# Xerolas

Xerolas is a cross-platform Electron desktop assistant that works like an AI lens for your whole operating system. It captures any screen region inline, sends that image to the AI provider you configure, and shows the answer beside the selection.

The open-source safety model is BYOK by default:

- users add their own Anthropic, OpenAI, Gemini, or OpenRouter key in Settings
- provider keys are stored outside `settings.json` using Electron OS encryption
- the renderer only sees redacted key status, never the saved key
- screenshots are sent only to the selected provider or an explicitly configured self-hosted gateway
- no Xerolas-owned provider key is committed, packaged, or required for public source builds

The public release setup remains free:

- source can be public without shipping maintainer-owned API keys
- separate public GitHub Releases repo for downloads
- free Vercel landing page on a `*.vercel.app` subdomain
- no paid services
- no custom domain
- no license flow

## Public release defaults

- Source repo: `ideepakchauhan7/Xerolas`
- Public downloads repo: `ideepakchauhan7/Xerolas-downloads`
- Public downloads URL: `https://github.com/ideepakchauhan7/Xerolas-downloads/releases`
- Vercel landing page: default `*.vercel.app` domain only

## Packaging and updates

The packaged desktop app should ship with:

- `updateGithubOwner = ideepakchauhan7`
- `updateGithubRepo = Xerolas-downloads`
- no default `backendBaseUrl`; users configure a provider key locally

Installers and updater metadata are published through the public downloads repo releases at `https://github.com/ideepakchauhan7/Xerolas-downloads/releases`.

## Local AI provider setup

Fresh public builds do not call a hosted Xerolas backend. Open Settings and configure:

- Primary provider: Anthropic, OpenAI, Gemini, or OpenRouter.
- API key: saved with Electron `safeStorage` when OS encryption is available.
- Optional model override: leave blank to use the built-in provider default.
- Optional fallback providers: used only for retryable capacity/network failures.
- Web search: off by default; enable only if you accept provider-side latency or cost.

Fallbacks are explicit and conservative. Xerolas does not fallback on invalid keys, auth failures, billing errors, or bad-request/model errors because those usually need user action.

If OS encryption is unavailable in a production build, Xerolas refuses to persist API keys. Development plaintext storage is available only with `XEROLAS_ALLOW_PLAINTEXT_KEYS=1`.

## Feedback loop

Public feedback should go through the downloads repo so release users have one obvious place to report product issues:

- Report issues: `https://github.com/ideepakchauhan7/Xerolas-downloads/issues/new?template=bug_report.yml`
- Request features: `https://github.com/ideepakchauhan7/Xerolas-downloads/issues/new?template=feature_request.yml`
- Share uninstall feedback: `https://github.com/ideepakchauhan7/Xerolas-downloads/issues/new?template=uninstall_feedback.yml`

Track the launch loop without hidden telemetry:

- Downloads: GitHub release asset download counts, plus Snap Store channel data.
- Update checks: downloads of `latest.yml`, `latest-mac.yml`, and `latest-linux.yml`.
- Daily captures: only user-volunteered workflow frequency in issues or interviews.
- Failed captures: issue reports tagged `bug` / `user-feedback`, including OS, version, install type, and error message.
- Uninstall complaints: issue reports tagged `uninstall-feedback`.

Do not add silent desktop telemetry without an explicit opt-in design and privacy copy.

## Optional self-hosted gateway

The Cloudflare Worker backend is still available for users who want a self-hosted gateway instead of direct local BYOK provider calls. Configure `backendBaseUrl` through `build/app-config.json`, `config/app-config.local.json`, or `CONTEXT_AI_BACKEND_URL`.

Required secrets:

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put CONTEXT_AI_SESSION_SECRET
```

Backend abuse controls are enabled by default: desktop requests without a browser `Origin` are allowed, browser origins are denied unless explicitly configured, session bootstrap is rate-limited, analyze requests are rate-limited per session, and oversized capture payloads are rejected before provider calls.

Optional Worker variables/secrets:

- `CONTEXT_AI_ALLOWED_ORIGINS` comma-separated browser origins to allow, for example `https://xerolas.vercel.app`; leave unset to block browser-origin calls.
- `CONTEXT_AI_SESSION_RATE_LIMIT_PER_MINUTE` defaults to `12`.
- `CONTEXT_AI_ANALYZE_RATE_LIMIT_PER_MINUTE` defaults to `30`.

Optional free-model fallback when Gemini is at capacity:

```bash
npx wrangler secret put OPENROUTER_API_KEY
```

By default the OpenRouter fallback uses `openrouter/free` without OpenRouter web search. Official OpenRouter docs say web search can incur extra costs even with free models, so only enable it if you intentionally accept that tradeoff:

```bash
npx wrangler secret put CONTEXT_AI_OPENROUTER_ENABLE_WEB_SEARCH # set to true
```

Deploy:

```bash
npm run deploy:worker
```

## Vercel

Deploy the static `landing/` site to a free Vercel project and use the Vercel-provided subdomain. Do not configure a custom domain.

## GitHub Releases

Tag a source release such as `v0.1.10` in the private repo and let the release workflow build and upload the artifacts into the separate public downloads repo. The workflow requires a `DOWNLOADS_REPO_TOKEN` secret with `contents: write` access to the downloads repo.

- Windows `.exe`
- macOS `.dmg`
- Linux `.snap` for Snap Store / Ubuntu App Center distribution, recommended for Ubuntu users
- Linux `.AppImage` as a manual portable package
- Linux `.deb` as a manual package for users who specifically need Debian packaging
- updater metadata used by `electron-updater`
