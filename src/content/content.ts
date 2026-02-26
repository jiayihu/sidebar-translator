import type { Message, TextBlock } from '../lib/messages';

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
const DEBOUNCE_MS = 400;

// ─── State ────────────────────────────────────────────────────────────────────

let idCounter = 0;
let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let observerActive = false;

// ─── Style injection ──────────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('st-styles')) return;
  const style = document.createElement('style');
  style.id = 'st-styles';
  style.textContent = `
    [${ST_ATTR}].${HIGHLIGHT_CLASS} {
      outline: 2px solid #4f46e5 !important;
      background: rgba(79, 70, 229, 0.08) !important;
      border-radius: 2px;
    }
    [${ST_ATTR}].${SELECTED_CLASS} {
      outline: 2px solid #4f46e5 !important;
      background: rgba(79, 70, 229, 0.18) !important;
      border-radius: 2px;
    }
  `;
  document.head.appendChild(style);
}

// ─── DOM Utilities ────────────────────────────────────────────────────────────

function isHidden(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.offsetParent === null && el.tagName !== 'BODY') return true;
  const style = window.getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
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

// ─── Text Extraction ──────────────────────────────────────────────────────────

function assignId(el: HTMLElement): string {
  const existing = el.getAttribute(ST_ATTR);
  if (existing) return existing;

  idCounter += 1;
  const id = `st-${idCounter}`;

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
    blocks.push({ id, text });
  }

  return blocks;
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

function setupEventListeners(): void {
  let currentHighlightId: string | null = null;

  document.addEventListener('mouseover', (e) => {
    const target = e.target as Element;
    const el = target.closest(`[${ST_ATTR}]`) as HTMLElement | null;
    const id = el?.getAttribute(ST_ATTR) ?? null;

    if (id === currentHighlightId) return;
    currentHighlightId = id;

    if (id) {
      highlightElement(id);
    } else if (currentHighlightedEl) {
      currentHighlightedEl.classList.remove(HIGHLIGHT_CLASS);
      currentHighlightedEl = null;
    }

    chrome.runtime.sendMessage({ type: 'ELEMENT_HOVERED', id } satisfies Message).catch(() => {});
  });

  document.addEventListener('mouseout', (e) => {
    const target = e.target as Element;
    const el = target.closest(`[${ST_ATTR}]`) as HTMLElement | null;
    if (!el) return;

    const relatedTarget = e.relatedTarget as Element | null;
    const stillInside = relatedTarget ? el.contains(relatedTarget) : false;
    if (!stillInside) {
      currentHighlightId = null;
      if (currentHighlightedEl) {
        currentHighlightedEl.classList.remove(HIGHLIGHT_CLASS);
        currentHighlightedEl = null;
      }
      chrome.runtime.sendMessage({ type: 'ELEMENT_HOVERED', id: null } satisfies Message).catch(() => {});
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target as Element;
    const el = target.closest(`[${ST_ATTR}]`) as HTMLElement | null;
    if (!el) return;

    const id = el.getAttribute(ST_ATTR);
    if (!id) return;

    chrome.runtime.sendMessage({ type: 'ELEMENT_CLICKED', id } satisfies Message).catch(() => {});
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

// ─── MutationObserver ─────────────────────────────────────────────────────────

const OBSERVER_OPTIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
  attributeFilter: [ST_ATTR],
};

function setupMutationObserver(): void {
  // Disconnect any previous observer before creating a new one
  if (observer) {
    observer.disconnect();
    observerActive = false;
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
        chrome.runtime.sendMessage({ type: 'NEW_TEXT_BLOCKS', blocks: newBlocks } satisfies Message).catch(() => {});
      }
    }

    if (pendingUpdated.size > 0) {
      for (const [id, text] of pendingUpdated) {
        chrome.runtime.sendMessage({ type: 'TEXT_UPDATED', id, text } satisfies Message).catch(() => {});
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
    injectStyles();
    const blocks = extractTextBlocks();
    setupMutationObserver();
    sendResponse({ type: 'PAGE_TEXT', blocks, pageLang: document.documentElement.lang || undefined });
    return false;
  }

  if (message.type === 'HIGHLIGHT_ELEMENT') {
    highlightElement(message.id);
    return false;
  }

  if (message.type === 'UNHIGHLIGHT_ELEMENT') {
    unhighlightElement(message.id);
    return false;
  }

  return false;
});

// ─── Init ─────────────────────────────────────────────────────────────────────

setupEventListeners();
