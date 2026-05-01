# Xerolas

Xerolas is a cross-platform Electron desktop assistant that works like Google Lens for your whole operating system. It captures any screen region inline, sends that image to a Cloudflare Worker backend, and shows the Gemini result beside the selection.

The public release setup is fully free:

- private source repo
- separate public GitHub Releases repo for downloads
- free Cloudflare Worker backend
- free Vercel landing page on a `*.vercel.app` subdomain
- no paid services
- no custom domain
- no license flow

## Public release defaults

- Source repo: private `ideepakchauhan7/Xerolas`
- Public downloads repo: `ideepakchauhan7/Xerolas-downloads`
- Public downloads URL: `https://github.com/ideepakchauhan7/Xerolas-downloads/releases`
- Cloudflare Worker URL: `https://xerolas.ideepakchauhan7.workers.dev`
- Vercel landing page: default `*.vercel.app` domain only

## Packaging and updates

The packaged desktop app should ship with:

- `updateGithubOwner = ideepakchauhan7`
- `updateGithubRepo = Xerolas-downloads`
- `backendBaseUrl = https://xerolas.ideepakchauhan7.workers.dev`

Installers and updater metadata are published through the public downloads repo releases at `https://github.com/ideepakchauhan7/Xerolas-downloads/releases`.

## Free-stack deployment

### Cloudflare Worker

Required secrets:

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put CONTEXT_AI_SESSION_SECRET
```

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

### Vercel

Deploy the static `landing/` site to a free Vercel project and use the Vercel-provided subdomain. Do not configure a custom domain.

### GitHub Releases

Tag a source release such as `v0.1.10` in the private repo and let the release workflow build and upload the artifacts into the separate public downloads repo. The workflow requires a `DOWNLOADS_REPO_TOKEN` secret with `contents: write` access to the downloads repo.

- Windows `.exe`
- macOS `.dmg`
- Linux `.AppImage`
- Linux `.deb`
- Linux `.snap` for Snap Store / Ubuntu App Center distribution
- updater metadata used by `electron-updater`
