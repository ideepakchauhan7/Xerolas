# Xerolas

Xerolas is a cross-platform Electron desktop assistant that works like Google Lens for your whole operating system. It captures any screen region inline, sends that image to a Cloudflare Worker backend, and shows the Gemini result beside the selection.

The public release setup is fully free:

- private source repo
- separate public GitHub Releases repo for downloads
- free Cloudflare Worker backend
- free GitHub Pages site from the public downloads repo
- no paid services
- no custom domain
- no license flow

## Public release defaults

- Source repo: private `ideepakchauhan7/Xerolas`
- Public downloads repo: `ideepakchauhan7/Xerolas-downloads`
- Public downloads URL: `https://github.com/ideepakchauhan7/Xerolas-downloads/releases`
- Public site URL: `https://ideepakchauhan7.github.io/Xerolas-downloads/`
- Cloudflare Worker URL: `https://xerolas.ideepakchauhan7.workers.dev`

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

### GitHub Pages

Publish the static `landing/` site into the public `Xerolas-downloads` repo and enable GitHub Pages there.

Recommended free setup:

- source: `main` branch
- folder: `/docs`
- public site URL: `https://ideepakchauhan7.github.io/Xerolas-downloads/`

The included `publish-pages.yml` workflow syncs `landing/` into `docs/` in the public downloads repo using `DOWNLOADS_REPO_TOKEN`.

### GitHub Releases

Tag a source release such as `v0.1.10` in the private repo and let the release workflow build and upload the artifacts into the separate public downloads repo. The workflow requires a `DOWNLOADS_REPO_TOKEN` secret with `contents: write` access to the downloads repo.

- Windows `.exe`
- macOS `.dmg`
- Linux `.AppImage`
- Linux `.deb`
- updater metadata used by `electron-updater`
