# Xerolas

Xerolas is a cross-platform Electron desktop assistant that works like Google Lens for your whole operating system. It captures any screen region inline, sends that image to a Cloudflare Worker backend, and shows the Gemini result beside the selection.

The public release setup is fully free:

- public GitHub repo and GitHub Releases
- free Cloudflare Worker backend
- free Vercel landing page on a `*.vercel.app` subdomain
- no paid services
- no custom domain
- no license flow

## Public release defaults

- GitHub repo: `https://github.com/ideepakchauhan7/Xerolas`
- GitHub Releases repo: `ideepakchauhan7/Xerolas`
- Cloudflare Worker URL: `https://xerolas.ideepakchauhan7.workers.dev`
- Vercel landing page: default `*.vercel.app` domain only

## Packaging and updates

The packaged desktop app should ship with:

- `updateGithubOwner = ideepakchauhan7`
- `updateGithubRepo = Xerolas`
- `backendBaseUrl = https://xerolas.ideepakchauhan7.workers.dev`

Installers and updater metadata are published through public GitHub Releases.

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

Tag a release such as `v0.1.0` and let the release workflow build and upload:

- Windows `.exe`
- macOS `.dmg`
- Linux `.AppImage`
- Linux `.deb`
- updater metadata used by `electron-updater`
