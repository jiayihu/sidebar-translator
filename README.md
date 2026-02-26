<p align="center">
  <img src="public/icons/icon128.png" width="96" height="96" alt="Sidebar Translator logo" />
</p>

<h1 align="center">Sidebar Translator</h1>

<p align="center">
  A Chrome extension that translates any web page in a clean sidebar — without touching the original DOM.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/chrome-138%2B-green" alt="Chrome 138+" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
</p>

---

## Why

Most translation extensions inject translated text directly into the page, breaking layouts and making it hard to compare with the original. Sidebar Translator keeps the page untouched and shows translations side-by-side in Chrome's native Side Panel.

## Features

- **Side-by-side reading** — original text on the page, translations in the sidebar
- **Hover sync** — hover a paragraph in the sidebar to highlight it on the page, and vice versa
- **Chrome built-in AI** — powered by Chrome's Translator API, no API keys or accounts needed
- **Auto-detect source language** — or set it manually
- **Live page updates** — new content is detected and translated automatically via MutationObserver
- **Minimal permissions** — only `activeTab`, `sidePanel`, and `storage`

## Getting Started

### Install from source

```bash
git clone https://github.com/jiayihu/sidebar-translator.git
cd sidebar-translator
npm install
npm run build
```

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

### Usage

1. Navigate to any web page
2. Click the Sidebar Translator icon in the toolbar (or pin it first)
3. Choose source and target languages
4. Press **Translate page**

## Architecture

```
                  ┌──────────────┐
                  │  Side Panel  │  React app — shows translations
                  │  (React UI)  │
                  └──────┬───────┘
                         │ port messages + one-off messages
                  ┌──────┴───────┐
                  │  Background  │  Service worker — relays messages
                  │   (SW)       │
                  └──────┬───────┘
                         │ chrome.tabs.sendMessage
                  ┌──────┴───────┐
                  │   Content    │  Extracts text blocks, highlights elements,
                  │   Script     │  watches for DOM mutations
                  └──────────────┘
```

The content script tags each block-level element with a `data-st-id` attribute and sends the extracted text to the sidebar for translation. Hover and click events are relayed in both directions through the background service worker.

## Development

```bash
npm run dev      # watch mode — rebuilds on file changes
npm run build    # production build → dist/
```

Load or reload the `dist/` folder in `chrome://extensions` after each build.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Build | Vite + [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin) |
| Language | TypeScript (strict) |
| UI | React 18 + CSS Modules |
| APIs | Chrome Side Panel, Storage, Runtime messaging, Translator API |

## License

MIT
