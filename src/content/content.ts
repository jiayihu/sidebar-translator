import type { Message, PageSection, TextBlock } from '../lib/messages';

// ─── Helper: Safe message sending ─────────────────────────────────────────────

/**
 * Safely send a message to the extension background script.
 * Returns true if the message was sent, false if the extension context is invalid.
 */
function safeSendMessage(message: Message): boolean {
  try {
    if (!chrome.runtime?.id) {
      // Extension context has been invalidated (e.g., extension was reloaded)
      return false;
    }
    chrome.runtime.sendMessage(message).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BLOCK_LEVEL_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'BLOCKQUOTE', 'TD', 'TH', 'CAPTION',
  'FIGCAPTION', 'SUMMARY', 'DT', 'DD',
  'ARTICLE', 'SECTION', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE',
]);

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'SELECT', 'OPTION',
  'CODE', 'PRE', 'BUTTON', 'INPUT', 'LABEL', 'SVG', 'MATH',
]);

const ST_ATTR = 'data-st-id';
const HIGHLIGHT_CLASS = 'st-highlight';
const SELECTED_CLASS = 'st-selected';
const FLASH_CLASS = 'st-flash';
const TRANSLATION_MODE_CLASS = 'st-translation-mode';
const BLOCK_INTERACTIVE_CLASS = 'st-block-interactive';
const DEBOUNCE_MS = 400;

// ─── State ────────────────────────────────────────────────────────────────────

let hashCounts = new Map<string, number>();
let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let observerActive = false;
let activated = false; // true after first EXTRACT_TEXT
let translationMode = true; // Default: translation mode active
let blockInteractive = false; // Default: don't block interactive elements
let toggleButton: HTMLElement | null = null;

// ─── Style injection ──────────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('st-styles')) return;
  const style = document.createElement('style');
  style.id = 'st-styles';
  style.textContent = `
    /* Highlight styles */
    body.${TRANSLATION_MODE_CLASS} [${ST_ATTR}].${HIGHLIGHT_CLASS} {
      outline: 2px solid #4f46e5 !important;
      background: rgba(79, 70, 229, 0.08) !important;
      border-radius: 2px;
    }
    body.${TRANSLATION_MODE_CLASS} [${ST_ATTR}].${SELECTED_CLASS} {
      outline: 2px solid #4f46e5 !important;
      background: rgba(79, 70, 229, 0.18) !important;
      border-radius: 2px;
    }

    /* Cursor pointer on blocks in translation mode */
    body.${TRANSLATION_MODE_CLASS} [${ST_ATTR}] {
      cursor: pointer !important;
    }

    /* Block interactive elements when enabled */
    body.${TRANSLATION_MODE_CLASS}.${BLOCK_INTERACTIVE_CLASS} [${ST_ATTR}] a,
    body.${TRANSLATION_MODE_CLASS}.${BLOCK_INTERACTIVE_CLASS} [${ST_ATTR}] a *,
    body.${TRANSLATION_MODE_CLASS}.${BLOCK_INTERACTIVE_CLASS} [${ST_ATTR}] button,
    body.${TRANSLATION_MODE_CLASS}.${BLOCK_INTERACTIVE_CLASS} [${ST_ATTR}] input,
    body.${TRANSLATION_MODE_CLASS}.${BLOCK_INTERACTIVE_CLASS} [${ST_ATTR}] select,
    body.${TRANSLATION_MODE_CLASS}.${BLOCK_INTERACTIVE_CLASS} [${ST_ATTR}] textarea,
    body.${TRANSLATION_MODE_CLASS}.${BLOCK_INTERACTIVE_CLASS} [${ST_ATTR}] [role="button"],
    body.${TRANSLATION_MODE_CLASS}.${BLOCK_INTERACTIVE_CLASS} [${ST_ATTR}] label,
    body.${TRANSLATION_MODE_CLASS}.${BLOCK_INTERACTIVE_CLASS} [${ST_ATTR}] [onclick]:not([onclick=""]) {
      pointer-events: none !important;
    }

    /* Flash animation */
    @keyframes st-flash-animation {
      0%, 100% { outline-color: #4f46e5; background-color: rgba(79, 70, 229, 0.18); }
      50% { outline-color: #818cf8; background-color: rgba(129, 140, 248, 0.35); }
    }
    body.${TRANSLATION_MODE_CLASS} [${ST_ATTR}].${FLASH_CLASS} {
      outline: 2px solid #4f46e5 !important;
      border-radius: 2px;
      animation: st-flash-animation 0.3s ease-in-out 1;
    }

    /* Toggle button styles */
    .st-toggle-container {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      display: flex;
      background: #ffffff;
      border-radius: 24px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
      padding: 4px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .st-toggle-container:hover {
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.08);
    }
    .st-toggle-btn {
      padding: 8px 16px;
      border: none;
      background: transparent;
      border-radius: 20px;
      cursor: pointer;
      color: #6b7280;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .st-toggle-btn:hover {
      color: #374151;
    }
    .st-toggle-btn.active {
      background: #4f46e5;
      color: #ffffff;
    }
    .st-toggle-btn.active:hover {
      background: #4338ca;
    }
  `;
  document.head.appendChild(style);
}

// ─── Toggle Button ────────────────────────────────────────────────────────────

function createToggleButton(): void {
  if (toggleButton) return;

  const container = document.createElement('div');
  container.className = 'st-toggle-container';
  container.innerHTML = `
    <button class="st-toggle-btn" data-mode="read">📖 Lettura</button>
    <button class="st-toggle-btn active" data-mode="translate">🌐 Traduzione</button>
  `;

  const buttons = container.querySelectorAll('.st-toggle-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const mode = (btn as HTMLElement).dataset.mode;
      setTranslationMode(mode === 'translate');
    });
  });

  document.body.appendChild(container);
  toggleButton = container;

  // Set initial mode
  updateModeUI();
}

function setTranslationMode(enabled: boolean): void {
  translationMode = enabled;
  updateModeUI();

  // Clear any existing highlights when switching to read mode
  if (!enabled && currentHighlightedEl) {
    currentHighlightedEl.classList.remove(HIGHLIGHT_CLASS);
    currentHighlightedEl = null;
  }

  // Notify sidebar of mode change
  safeSendMessage({ type: 'MODE_CHANGED', translationMode: enabled } satisfies Message);
}

function updateModeUI(): void {
  if (!toggleButton) return;

  const buttons = toggleButton.querySelectorAll('.st-toggle-btn');
  buttons.forEach((btn) => {
    const isTranslate = (btn as HTMLElement).dataset.mode === 'translate';
    btn.classList.toggle('active', isTranslate === translationMode);
  });

  document.body.classList.toggle(TRANSLATION_MODE_CLASS, translationMode);
  updateBlockInteractiveUI();
}

function updateBlockInteractiveUI(): void {
  document.body.classList.toggle(BLOCK_INTERACTIVE_CLASS, blockInteractive && translationMode);
}

function setBlockInteractive(enabled: boolean): void {
  blockInteractive = enabled;
  updateBlockInteractiveUI();
}

// ─── DOM Utilities ────────────────────────────────────────────────────────────

function isHidden(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return true;
  }
  // offsetParent is null for position:fixed/sticky elements and for elements
  // inside display:none ancestors. Only treat it as hidden when the element
  // is not fixed/sticky positioned (and not the <body>).
  if (el.offsetParent === null && el.tagName !== 'BODY') {
    const pos = style.position;
    if (pos !== 'fixed' && pos !== 'sticky') return true;
  }
  return false;
}

function shouldSkip(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as Element;
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  return false;
}

function getBlockParent(node: Node): HTMLElement | null {
  let current: Node | null = node.parentNode;
  while (current && current !== document.body) {
    if (current instanceof HTMLElement) {
      const tag = current.tagName;
      if (BLOCK_LEVEL_TAGS.has(tag)) return current;
      if (current.getAttribute('role') === 'article') return current;
    }
    current = current.parentNode;
  }
  return node.parentElement;
}

function getPageSection(el: HTMLElement): PageSection {
  // Check explicit role first
  const role = el.getAttribute('role');
  if (role === 'banner') return 'header';
  if (role === 'navigation') return 'nav';
  if (role === 'main') return 'main';
  if (role === 'complementary') return 'aside';
  if (role === 'contentinfo') return 'footer';
  if (role === 'article') return 'article';

  // Check semantic tags
  const tag = el.tagName;

  // Walk up the DOM to find the nearest semantic container
  let current: HTMLElement | null = el;
  while (current && current !== document.body) {
    const currentTag = current.tagName;
    if (currentTag === 'HEADER') return 'header';
    if (currentTag === 'NAV') return 'nav';
    if (currentTag === 'MAIN') return 'main';
    if (currentTag === 'ASIDE') return 'aside';
    if (currentTag === 'FOOTER') return 'footer';
    if (currentTag === 'ARTICLE') return 'article';
    if (currentTag === 'SECTION') return 'section';
    current = current.parentElement;
  }

  return 'other';
}

// ─── Text Extraction ──────────────────────────────────────────────────────────

/** FNV-1a 32-bit hash → base-36 string (short and deterministic) */
function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function assignId(el: HTMLElement, text: string): string {
  // During partial extraction (mutations), keep existing IDs
  const existing = el.getAttribute(ST_ATTR);
  if (existing) return existing;

  const h = textHash(text);
  const n = hashCounts.get(h) ?? 0;
  hashCounts.set(h, n + 1);
  const id = n === 0 ? `st-${h}` : `st-${h}-${n}`;

  // Temporarily disconnect to avoid observer feedback loop
  if (observerActive && observer) {
    observer.disconnect();
    observerActive = false;
  }
  el.setAttribute(ST_ATTR, id);
  if (observer) {
    observer.observe(document.body, OBSERVER_OPTIONS);
    observerActive = true;
  }

  return id;
}

function extractTextBlocks(root: Element = document.body): TextBlock[] {
  const isFullExtraction = root === document.body;

  if (isFullExtraction) {
    // Disconnect observer so attribute removals don't trigger it
    if (observer) {
      observer.disconnect();
      observer = null;
      observerActive = false;
    }
    // Strip all existing IDs and reset hash counts for a clean, deterministic pass
    document.querySelectorAll(`[${ST_ATTR}]`).forEach((el) => {
      el.removeAttribute(ST_ATTR);
    });
    hashCounts.clear();
  }

  const blockMap = new Map<HTMLElement, string[]>();

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip nodes inside certain tags
      let parent: Node | null = node.parentNode;
      while (parent && parent !== document.body) {
        if (parent instanceof Element && shouldSkip(parent)) {
          return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentNode;
      }

      const text = node.textContent?.trim() ?? '';
      if (!text) return NodeFilter.FILTER_SKIP;

      const el = node.parentElement;
      if (!el || isHidden(el)) return NodeFilter.FILTER_SKIP;

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const blockEl = getBlockParent(textNode);
    if (!blockEl) continue;
    if (isHidden(blockEl)) continue;

    const texts = blockMap.get(blockEl) ?? [];
    texts.push(textNode.textContent?.trim() ?? '');
    blockMap.set(blockEl, texts);
  }

  const blocks: TextBlock[] = [];
  for (const [el, texts] of blockMap) {
    const text = texts.join(' ').trim();
    if (!text) continue;
    const id = assignId(el);
    const section = getPageSection(el);
    blocks.push({ id, text, section });
  }

  return blocks;
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

let currentHighlightId: string | null = null;
let hoverDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const HOVER_DEBOUNCE_MS = 300;

function setupEventListeners(): void {
  document.addEventListener('mouseover', (e) => {
    if (!translationMode) return;

    const target = e.target as Element;
    const el = target.closest(`[${ST_ATTR}]`) as HTMLElement | null;
    const id = el?.getAttribute(ST_ATTR) ?? null;

    if (id === currentHighlightId) return;

    // Clear any pending debounce timer
    if (hoverDebounceTimer) {
      clearTimeout(hoverDebounceTimer);
      hoverDebounceTimer = null;
    }

    // Update highlight immediately for visual feedback
    currentHighlightId = id;
    if (id) {
      highlightElement(id);
    } else if (currentHighlightedEl) {
      currentHighlightedEl.classList.remove(HIGHLIGHT_CLASS);
      currentHighlightedEl = null;
    }

    // Debounce the message to sidebar to avoid rapid scrolling
    hoverDebounceTimer = setTimeout(() => {
      hoverDebounceTimer = null;
      safeSendMessage({ type: 'ELEMENT_HOVERED', id } satisfies Message);
    }, HOVER_DEBOUNCE_MS);
  });

  document.addEventListener('mouseout', (e) => {
    if (!translationMode) return;

    const target = e.target as Element;
    const el = target.closest(`[${ST_ATTR}]`) as HTMLElement | null;
    if (!el) return;

    const relatedTarget = e.relatedTarget as Element | null;
    const stillInside = relatedTarget ? el.contains(relatedTarget) : false;
    if (!stillInside) {
      // Clear any pending debounce timer
      if (hoverDebounceTimer) {
        clearTimeout(hoverDebounceTimer);
        hoverDebounceTimer = null;
      }

      currentHighlightId = null;
      if (currentHighlightedEl) {
        currentHighlightedEl.classList.remove(HIGHLIGHT_CLASS);
        currentHighlightedEl = null;
      }
      safeSendMessage({ type: 'ELEMENT_HOVERED', id: null } satisfies Message);
    }
  });

  document.addEventListener('click', (e) => {
    if (!translationMode) return;

    const target = e.target as Element;
    const el = target.closest(`[${ST_ATTR}]`) as HTMLElement | null;
    if (!el) return;

    const id = el.getAttribute(ST_ATTR);
    if (!id) return;

    safeSendMessage({ type: 'ELEMENT_CLICKED', id } satisfies Message);
  });
}

// ─── Highlight Handlers ───────────────────────────────────────────────────────

let currentHighlightedEl: HTMLElement | null = null;

function highlightElement(id: string): void {
  if (currentHighlightedEl) {
    currentHighlightedEl.classList.remove(HIGHLIGHT_CLASS);
    currentHighlightedEl = null;
  }
  const el = document.querySelector(`[${ST_ATTR}="${id}"]`) as HTMLElement | null;
  if (el) {
    el.classList.add(HIGHLIGHT_CLASS);
    currentHighlightedEl = el;
  }
}

function unhighlightElement(id: string): void {
  const el = document.querySelector(`[${ST_ATTR}="${id}"]`) as HTMLElement | null;
  if (el) el.classList.remove(HIGHLIGHT_CLASS);
  if (currentHighlightedEl?.getAttribute(ST_ATTR) === id) {
    currentHighlightedEl = null;
  }
}

function scrollAndFlashElement(id: string): void {
  const el = document.querySelector(`[${ST_ATTR}="${id}"]`) as HTMLElement | null;
  if (!el) return;

  // Scroll into view
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Flash animation (single flash)
  el.classList.remove(FLASH_CLASS);
  // Force reflow to restart animation
  void el.offsetWidth;
  el.classList.add(FLASH_CLASS);

  // Remove flash class after animation completes
  setTimeout(() => {
    el.classList.remove(FLASH_CLASS);
  }, 300);
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

const OBSERVER_OPTIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
  attributeFilter: [ST_ATTR],
};

function setupMutationObserver(): void {
  // Disconnect any previous observer and clear pending debounce timer
  if (observer) {
    observer.disconnect();
    observerActive = false;
  }
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  const pendingAdded = new Set<Element>();
  const pendingUpdated = new Map<string, string>();

  function flush(): void {
    debounceTimer = null;

    if (pendingAdded.size > 0) {
      const newBlocks: TextBlock[] = [];
      for (const root of pendingAdded) {
        const blocks = extractTextBlocks(root);
        newBlocks.push(...blocks);
      }
      pendingAdded.clear();

      if (newBlocks.length > 0) {
        safeSendMessage({ type: 'NEW_TEXT_BLOCKS', blocks: newBlocks } satisfies Message);
      }
    }

    if (pendingUpdated.size > 0) {
      for (const [id, text] of pendingUpdated) {
        safeSendMessage({ type: 'TEXT_UPDATED', id, text } satisfies Message);
      }
      pendingUpdated.clear();
    }
  }

  function scheduleFlush(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, DEBOUNCE_MS);
  }

  observer = new MutationObserver((records) => {
    let hasWork = false;

    for (const record of records) {
      // Skip attribute mutations we caused ourselves
      if (record.type === 'attributes' && record.attributeName === ST_ATTR) continue;
      // Skip our toggle button
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node instanceof Element && node.classList.contains('st-toggle-container')) {
            continue;
          }
        }
      }

      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            // Skip our own style injection
            if (node.id === 'st-styles') continue;
            pendingAdded.add(node);
            hasWork = true;
          } else if (node instanceof Text && node.textContent?.trim()) {
            // New text node: scan its parent element
            const parent = node.parentElement;
            if (parent) {
              pendingAdded.add(parent);
              hasWork = true;
            }
          }
        }
      }

      if (record.type === 'characterData') {
        const parent = record.target.parentElement;
        if (parent) {
          const id = parent.getAttribute(ST_ATTR);
          if (id) {
            const text = parent.textContent?.trim() ?? '';
            if (text) {
              pendingUpdated.set(id, text);
              hasWork = true;
            }
          }
        }
      }
    }

    if (hasWork) scheduleFlush();
  });

  observer.observe(document.body, OBSERVER_OPTIONS);
  observerActive = true;
}

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_TEXT') {
    // First activation: inject styles and event listeners
    if (!activated) {
      activated = true;
      injectStyles();
      setupEventListeners();
      createToggleButton();
    }

    const blocks = extractTextBlocks();
    setupMutationObserver();
    sendResponse({ type: 'PAGE_TEXT', blocks, pageLang: document.documentElement.lang || undefined });
    return false;
  }

  if (message.type === 'HIGHLIGHT_ELEMENT') {
    if (translationMode) {
      highlightElement(message.id);
    }
    return false;
  }

  if (message.type === 'UNHIGHLIGHT_ELEMENT') {
    if (translationMode) {
      unhighlightElement(message.id);
    }
    return false;
  }

  if (message.type === 'SCROLL_TO_ELEMENT') {
    if (translationMode) {
      scrollAndFlashElement(message.id);
    }
    return false;
  }

  if (message.type === 'BLOCK_INTERACTIVE_CHANGED') {
    setBlockInteractive(message.blockInteractive);
    return false;
  }

  return false;
});
