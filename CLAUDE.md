# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a browser extension (WebExtension) built with TypeScript and Vite, targeting both Chrome and Firefox. The project uses `vite-plugin-web-extension` to handle cross-browser compatibility and build processes.

## Build Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the extension for production (outputs to `dist/`)
- `npm run compile` - TypeScript type checking without emitting files

## Architecture

### Entry Points

The extension has two main entry points:

1. **Background Script** (`src/background.ts`) - Service worker (Chrome) / background script (Firefox)
   - Listens to extension lifecycle events (`runtime.onInstalled`)
   - Monitors tab events (`tabs.onCreated`, `tabs.onUpdated`)
   - Handles browser-level logic that runs independently of any specific page

2. **Popup UI** (`src/popup.html` + `src/popup.ts`) - Browser action popup
   - Simple HTML page with TypeScript module
   - Uses `src/popup.css` for styling
   - Currently displays a basic template interface

### Manifest Configuration

The `src/manifest.json` uses conditional syntax for cross-browser support:
- `{{chrome}}` prefixes for Chrome-specific properties
- `{{firefox}}` prefixes for Firefox-specific properties
- The `vite-plugin-web-extension` plugin processes these conditionals at build time

The manifest is dynamically generated in `vite.config.ts`, merging:
- Base manifest from `src/manifest.json`
- Name/description/version from `package.json`

### Browser API

Uses `webextension-polyfill` for cross-browser compatibility. Import as:
```typescript
import browser from "webextension-polyfill";
```

This provides a Promise-based API that works consistently across Chrome and Firefox.

### Permissions

Current permissions in manifest:
- `tabs` - Access to tab information and events
- `activeTab` - Access to the currently active tab

## Project Structure

```
src/
├── background.ts    # Background service worker/script
├── popup.html       # Popup UI HTML
├── popup.ts         # Popup UI logic
├── popup.css        # Popup UI styles
├── manifest.json    # Extension manifest (with cross-browser conditionals)
└── vite-env.d.ts    # Vite type definitions

public/
├── icon/            # Extension icons (16, 32, 48, 96, 128px)
└── icon-with-shadow.svg  # SVG icon used in popup

dist/                # Build output (gitignored)
```

## TypeScript Configuration

Strict mode enabled with:
- `noUnusedLocals`, `noUnusedParameters` - Enforce cleanup of unused code
- `noImplicitReturns` - All code paths must return a value
- Target: ESNext with DOM and ESNext libs
