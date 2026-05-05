# Xerolas

Xerolas is a cross-platform Electron desktop assistant that works like an AI lens for your whole operating system. It captures any screen region inline, sends that image to the AI provider you configure, and shows the answer beside the selection.

The open-source safety model is BYOK by default:

- users add their own Anthropic, OpenAI, Gemini, or OpenRouter key in Settings
- provider keys are stored outside `settings.json` using Electron OS encryption
- the renderer only sees redacted key status, never the saved key
- screenshots are sent only to the selected provider
- no Xerolas-owned provider key is committed, packaged, or required for public source builds

The public release setup remains free:

- public source repo without shipping maintainer-owned API keys
- GitHub Releases in the main `Xerolas` repo for downloads and updater metadata
- public landing page at `https://xerolas.vercel.app`
- no paid distribution infrastructure
- no custom domain
- no license flow

## Public release defaults

- Public source and releases repo: `ideepakchauhan7/Xerolas`
- Public downloads URL: `https://github.com/ideepakchauhan7/Xerolas/releases`
- Public site: `https://xerolas.vercel.app`

## Packaging and updates

The packaged desktop app should ship with:

- `updateGithubOwner = ideepakchauhan7`
- `updateGithubRepo = Xerolas`
- no bundled provider key; users configure their own provider key locally

Installers and updater metadata are published through the main public repo releases at `https://github.com/ideepakchauhan7/Xerolas/releases`.

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

Public feedback should go through the main repo so users have one obvious place to report product issues:

- Report issues: `https://github.com/ideepakchauhan7/Xerolas/issues/new?template=bug_report.yml`
- Request features: `https://github.com/ideepakchauhan7/Xerolas/issues/new?template=feature_request.yml`
- Share uninstall feedback: `https://github.com/ideepakchauhan7/Xerolas/issues/new?template=uninstall_feedback.yml`

Track the launch loop without hidden telemetry:

- Downloads: GitHub release asset download counts, plus Snap Store channel data.
- Update checks: downloads of `latest.yml`, `latest-mac.yml`, and `latest-linux.yml`.
- Daily captures: only user-volunteered workflow frequency in issues or interviews.
- Failed captures: issue reports tagged `bug` / `user-feedback`, including OS, version, install type, and error message.
- Uninstall complaints: issue reports tagged `uninstall-feedback`.

Do not add silent desktop telemetry without an explicit opt-in design and privacy copy.

## Contributing

The public repo is intentionally focused on the desktop app. There is no hosted Xerolas backend, no maintainer-owned AI key, and no hidden release infrastructure required to work on the code.

Contributor setup:

```bash
npm install
npm run typecheck
npm run build
```

Run locally:

```bash
npm run dev
```

Then open Settings in the app and add your own provider key. Keep real keys out of commits, screenshots, logs, and issue reports.

## GitHub Releases

Tag a source release such as `v0.1.30` in the public repo and let the release workflow build and upload the artifacts into the same repo's GitHub Release.

- Windows `.exe`
- macOS `.dmg`
- Linux `.snap` for Snap Store / Ubuntu App Center distribution, recommended for Ubuntu users
- Linux `.AppImage` as a manual portable package
- Linux `.deb` as a manual package for users who specifically need Debian packaging
- updater metadata used by `electron-updater`

## License

Xerolas is released under the MIT License.
