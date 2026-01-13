# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a browser extension (WebExtension) built with TypeScript and Vite, targeting both Chrome and Firefox. The extension adds HTML5 video controls and rotation functionality to Instagram videos (reels and posts). The project uses `vite-plugin-web-extension` to handle cross-browser compatibility and build processes.

### Features

- **HTML5 Video Controls**: Automatically enables native browser controls on all Instagram videos, providing timeline scrubbing, volume control, and fullscreen capabilities
- **Video Rotation**: Adds a rotation button (top-right corner) that cycles through 0° → 90° → 180° → 270° rotations with proper scaling for landscape videos in portrait resolution

## Build Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the extension for production (outputs to `dist/`)
- `npm run compile` - TypeScript type checking without emitting files

## Architecture

### Entry Points

The extension has three main entry points:

1. **Content Script** (`src/content/instagram.ts`) - Injected into Instagram pages
   - Main functionality: `InstagramVideoController` class
   - Detects video elements using MutationObserver (handles dynamic loading)
   - Enables HTML5 controls via `controls` attribute
   - Injects rotation button overlay with CSS transforms
   - Operates autonomously without background script communication
   - Styles: `src/content/styles.css` for rotation button UI

2. **Background Script** (`src/background.ts`) - Service worker (Chrome) / background script (Firefox)
   - Listens to extension lifecycle events (`runtime.onInstalled`)
   - Monitors tab events (`tabs.onCreated`, `tabs.onUpdated`)
   - Currently minimal - content script handles all Instagram functionality

3. **Popup UI** (`src/popup.html` + `src/popup.ts`) - Browser action popup
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
- `host_permissions` (Chrome) / `permissions` (Firefox) - `https://www.instagram.com/*` for content script injection

## Project Structure

```
src/
├── content/
│   ├── instagram.ts      # Instagram content script (video controls & rotation)
│   └── styles.css        # Content script styles (rotation button UI)
├── background.ts         # Background service worker/script
├── popup.html            # Popup UI HTML
├── popup.ts              # Popup UI logic
├── popup.css             # Popup UI styles
├── manifest.json         # Extension manifest (with cross-browser conditionals)
└── vite-env.d.ts         # Vite type definitions

public/
├── icon/                 # Extension icons (16, 32, 48, 96, 128px)
└── icon-with-shadow.svg  # SVG icon used in popup

dist/                     # Build output (gitignored)
```

## Content Script Architecture

The Instagram content script (`src/content/instagram.ts`) uses:
- **WeakSet** to track processed videos (prevents double-processing, no memory leaks)
- **MutationObserver** to detect dynamically loaded videos (Instagram's infinite scroll)
- **WeakMap** to store rotation state per video element
- **CSS transforms** with scaling math for 90°/270° rotations to fit landscape videos in portrait containers

## TypeScript Configuration

Strict mode enabled with:
- `noUnusedLocals`, `noUnusedParameters` - Enforce cleanup of unused code
- `noImplicitReturns` - All code paths must return a value
- Target: ESNext with DOM and ESNext libs
