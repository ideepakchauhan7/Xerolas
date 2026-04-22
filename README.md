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

Deploy:

```bash
npm run deploy:worker
```

### Vercel

Deploy the static `landing/` site to a free Vercel project and use the Vercel-provided subdomain. Do not configure a custom domain.

### GitHub Releases

Tag a source release such as `v0.1.0` in the private repo and let the release workflow build and upload the artifacts into the separate public downloads repo. The workflow requires a `DOWNLOADS_REPO_TOKEN` secret with `contents: write` access to the downloads repo.

- Windows `.exe`
- macOS `.dmg`
- Linux `.AppImage`
- Linux `.deb`
- updater metadata used by `electron-updater`
