# Sidebar Translator – Chrome Extension

## Overview
A Chrome extension (Manifest V3) that translates page content in a sidebar without modifying the live DOM. Built with Vite + React + TypeScript.

## Tech Stack
- **Build**: Vite + `@crxjs/vite-plugin` (handles MV3 multi-entry, HMR, manifest processing)
- **Language**: TypeScript (strict mode)
- **UI**: React 18 + CSS Modules
- **Chrome API**: Side Panel API (Chrome 114+), `chrome.storage.sync`, `chrome.runtime` messaging

## Project Structure
```
src/
  background/background.ts     # Service worker – relays messages, opens sidebar
  content/content.ts           # Content script – DOM extraction, hover/click events, highlights
  sidepanel/                   # Side panel React app
    index.html, main.tsx, App.tsx
    components/
      TranslationItem.tsx / .module.css
      TranslationList.tsx / .module.css
      LanguagePicker.tsx / .module.css
    App.module.css, sidepanel.css
  lib/
    messages.ts                # Shared Message union type + TextBlock interface
    storage.ts                 # chrome.storage.sync wrappers (getSettings / saveSettings)
    translation/
      types.ts                 # ITranslator interface
      chrome-ai.ts             # Chrome built-in Translator API (with quota checks)
      index.ts                 # Factory: Chrome AI or error
```

## Build & Development
```bash
npm install
npm run build    # production build → dist/
npm run dev      # watch mode (vite build --watch)
```

Load `dist/` as an unpacked extension in `chrome://extensions`.

## Architecture

### Message Flow
- Side panel sends `EXTRACT_TEXT` → background relays to content script
- Content script responds synchronously with `PAGE_TEXT` blocks
- Content script sends `ELEMENT_HOVERED` / `ELEMENT_CLICKED` → background → side panel port
- Side panel sends `HIGHLIGHT_ELEMENT` / `UNHIGHLIGHT_ELEMENT` → background → content script

### Communication Pattern
- Side panel connects with a **long-lived port** named `"sidepanel"` for receiving push messages
- One-off messages use `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`

### Translation
Uses Chrome's built-in Translator API exclusively. The `ChromeAITranslator` class checks `inputQuota` / `measureInputUsage()` before each translation to provide clear quota-exceeded errors.

### Dynamic Content
Content script attaches a `MutationObserver` after initial extraction with 400ms debounce. Sends `NEW_TEXT_BLOCKS` for new elements and `TEXT_UPDATED` for changed text in already-tagged elements. Observer temporarily disconnects when assigning `data-st-id` attributes to avoid feedback loops.

## Settings (chrome.storage.sync)
- `targetLanguage` – BCP 47 code (default `"en"`)
- `sourceLanguage` – BCP 47 code or `"auto"` (default `"auto"`)

## CSS Classes Injected by Content Script
- `.st-highlight` – soft purple outline (hover from sidebar)
- `.st-selected` – stronger highlight (click from page → scroll sidebar)
- `data-st-id="st-N"` – unique ID attribute on each block-level text element
