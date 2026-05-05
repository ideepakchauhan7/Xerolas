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
- Optionally enable provider-native web search for answers that need current context and source links.

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

## Bring Your Own Key

Xerolas is BYOK by default. The public build does not include a Xerolas-owned provider key and does not call a hosted Xerolas backend.

Supported providers:

- Anthropic
- OpenAI
- Gemini
- OpenRouter

Open Settings in the app, choose a provider, and save your API key. Keys are stored outside normal settings using Electron OS encryption when available. The renderer only receives redacted key status, never the full saved key.

Optional settings:

- Model override for advanced users.
- Explicit fallback providers for retryable capacity or network failures.
- Web search toggle for provider-native search when supported.
- Translate target language.
- Global capture hotkey.

## Privacy And Security

- Screenshots are sent only to the AI provider you select.
- No Xerolas-owned AI key is committed, packaged, or required.
- Provider keys are never returned to the renderer after saving.
- Invalid keys, billing errors, auth failures, and bad requests do not silently fallback to another provider.
- Xerolas does not add silent desktop telemetry. Feedback is handled through GitHub issues.

If OS encryption is unavailable in a production build, Xerolas refuses to persist API keys. Development plaintext storage is available only with `XEROLAS_ALLOW_PLAINTEXT_KEYS=1`.

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

The repository is intentionally focused on the desktop app. The landing page is managed separately as a local-only ignored folder, and the public app uses local BYOK provider routing instead of a hosted backend.

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
