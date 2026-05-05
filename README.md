<div align="center">

# Xerolas

### See anything. Understand everything.

Desktop-wide AI screen intelligence for Windows, macOS, and Linux.

[Website](https://xerolas.vercel.app) · [Download](https://github.com/ideepakchauhan7/Xerolas/releases) · [Report issue](https://github.com/ideepakchauhan7/Xerolas/issues/new?template=bug_report.yml) · [Request feature](https://github.com/ideepakchauhan7/Xerolas/issues/new?template=feature_request.yml) · [License](./LICENSE)

![Xerolas demo](./docs/assets/xerolas-demo.gif)

</div>

## What Is Xerolas?

Xerolas is an open-source Electron desktop app that works like an AI lens for your whole operating system. Press the hotkey, drag over any screen region, and get an answer in a floating result panel beside the capture.

It is built for the moments where copying text is awkward, switching to a browser breaks flow, or the thing you need help with is already visible on your screen.

## Features

- Capture any screen region from any app with a global hotkey.
- Get AI overview answers beside the selected capture.
- Extract text from screenshots, documents, UI, and images.
- Explain code snippets, errors, stack traces, and technical screens.
- Translate captured text into your saved target language.
- Summarize dense pages, PDFs, docs, notes, and articles.
- Ask follow-up questions about the current capture without taking another screenshot.
- Optionally enable provider-native or Xerolas Cloud web-aware answers when current context and source links help.

## Download

Installers and update metadata are published through GitHub Releases:

https://github.com/ideepakchauhan7/Xerolas/releases

Recommended public install paths:

- Windows: download the `.exe` installer.
- macOS: download the `.dmg`.
- Ubuntu/Linux: use the Snap/App Center build when available.
- Linux manual installs: use `.AppImage` for portable use or `.deb` if you specifically need Debian packaging.

The public site is available at:

https://xerolas.vercel.app

## Access Modes

Xerolas is BYOK-first. The open-source desktop app does not commit, package, or expose Xerolas-owned provider keys.

There are two supported access modes:

- Bring Your Own Key: the desktop app calls the selected provider directly with your locally saved key.
- Xerolas Cloud: optional platform-key mode for users who receive an `xlo_live_...` key from Xerolas. The desktop app sends captures to a hosted gateway, and the gateway uses managed AI providers with server-side quotas and abuse controls.

Supported providers:

- Anthropic
- OpenAI
- Gemini
- OpenRouter
- Xerolas Cloud

Open Settings in the app, choose a provider, and save your key. Keys are stored outside normal settings using Electron OS encryption when available. The renderer only receives redacted key status, never the full saved key.

For `Xerolas Cloud`, the app stores only the opaque platform key locally. Real managed-provider credentials live only in the hosted gateway environment and are never part of the desktop repo or client bundle.

Optional settings:

- Model override for advanced BYOK users.
- Explicit fallback providers between BYOK providers for retryable capacity or network failures.
- Web search toggle for provider-native search when supported.
- Translate target language.
- Global capture hotkey.

## Privacy And Security

- In BYOK mode, screenshots are sent directly to the AI provider you select.
- In Xerolas Cloud mode, screenshots are sent to the Xerolas Cloud gateway and processed by managed AI providers.
- No Xerolas-owned AI key is committed, packaged, or exposed in the desktop app.
- Provider and platform keys are never returned to the renderer after saving.
- Invalid keys, billing errors, auth failures, and bad requests do not silently fallback to another provider or to Xerolas Cloud.
- Xerolas does not add silent desktop telemetry. Feedback is handled through GitHub issues.

If OS encryption is unavailable in a production build, Xerolas refuses to persist provider keys. Development plaintext storage is available only with `XEROLAS_ALLOW_PLAINTEXT_KEYS=1`.

## Development

Requirements:

- Node.js 20+
- npm

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run dev
```

Typecheck:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

Optional Xerolas Cloud builds can set `XEROLAS_CLOUD_GATEWAY_BASE_URL` or add `xerolasCloudGatewayBaseUrl` to `config/app-config.local.json`. The value should point to a separately hosted gateway that implements `/v1/key/status` and `/v1/analyze/stream`.

Expected Xerolas Cloud gateway contract:

- `GET /v1/key/status`: validate the `Authorization: Bearer xlo_live_...` platform key and return redacted key status plus remaining quota.
- `POST /v1/analyze/stream`: validate the platform key, enforce quota/rate limits, call managed AI providers with server-side secrets, and stream normalized answer/search/source events back to the desktop app.
- `POST /v1/keys`: issue or revoke platform keys from the Xerolas site or admin flow. Store only hashed platform keys server-side.

The repository is intentionally focused on the desktop app. The landing page is managed separately as a local-only ignored folder. Xerolas Cloud is an optional separately hosted gateway; keep its managed provider secrets outside this repo and outside client bundles.

## Releases

Create a version tag such as `v0.1.30` and let the GitHub release workflow build the public artifacts:

- Windows `.exe`
- macOS `.dmg`
- Linux `.snap`
- Linux `.AppImage`
- Linux `.deb`
- updater metadata for `electron-updater`

The packaged app is configured to read update metadata from the main public `ideepakchauhan7/Xerolas` release feed.

## Contributing And Feedback

Useful feedback is very welcome:

- [Report a bug](https://github.com/ideepakchauhan7/Xerolas/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/ideepakchauhan7/Xerolas/issues/new?template=feature_request.yml)
- [Share uninstall feedback](https://github.com/ideepakchauhan7/Xerolas/issues/new?template=uninstall_feedback.yml)

When reporting capture or provider issues, include your OS, Xerolas version, install type, selected provider, and the exact error message. Do not include API keys or private screenshots.

## License

Xerolas is released under the [MIT License](./LICENSE).
