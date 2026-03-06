import type { PageSection } from '../lib/messages';

export const BLOCK_LEVEL_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'BLOCKQUOTE', 'TD', 'TH', 'CAPTION',
  'FIGCAPTION', 'SUMMARY', 'DT', 'DD',
]);

const GENERIC_CONTAINER_TAGS = new Set([
  ...BLOCK_LEVEL_TAGS,
  'DIV',
]);

const SECTIONING_TAGS = new Set([
  'ARTICLE', 'SECTION', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE',
]);

export const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'SELECT', 'OPTION',
  'CODE', 'PRE', 'BUTTON', 'INPUT', 'LABEL', 'SVG', 'MATH',
]);

export interface DetectedBlock {
  text: string;
  element: HTMLElement;
  section: PageSection;
}

export interface DetectOptions {
  isHidden?: (el: Element) => boolean;
}

export function shouldSkip(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  return false;
}

function isSectioningContainer(el: HTMLElement): boolean {
  const role = el.getAttribute('role');
  return SECTIONING_TAGS.has(el.tagName) || role === 'article' || role === 'main';
}

function isNamedTextContainer(el: HTMLElement): boolean {
  if (el.hasAttribute('data-item-type') || el.hasAttribute('data-text-type')) {
    return true;
  }

  const selector = el.getAttribute('data-selector');
  return selector !== null && /(message|item|entry|card|cell|title|heading|content|body|caption|description)/i.test(selector);
}

export function getBlockParent(node: Node, boundary: Node): HTMLElement | null {
  let current: Node | null = node.parentNode;
  let genericFallback: HTMLElement | null = null;
  let sectionFallback: HTMLElement | null = null;

  while (current && current !== boundary) {
    if (current instanceof HTMLElement) {
      if (BLOCK_LEVEL_TAGS.has(current.tagName) || isNamedTextContainer(current)) {
        return current;
      }

      if (genericFallback === null && GENERIC_CONTAINER_TAGS.has(current.tagName)) {
        genericFallback = current;
      }

      if (sectionFallback === null && isSectioningContainer(current)) {
        sectionFallback = current;
      }
    }
    current = current.parentNode;
  }

  return genericFallback ?? sectionFallback ?? node.parentElement;
}

export function getPageSection(el: HTMLElement): PageSection {
  const role = el.getAttribute('role');
  if (role === 'banner') return 'header';
  if (role === 'navigation') return 'nav';
  if (role === 'main') return 'main';
  if (role === 'complementary') return 'aside';
  if (role === 'contentinfo') return 'footer';
  if (role === 'article') return 'article';

  let current: HTMLElement | null = el;
  while (current && current.tagName !== 'BODY') {
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

export function isTranslatable(text: string): boolean {
  if (!text) return false;
  if (/^\d+$/.test(text)) return false;
  return true;
}

export function detectTextBlocks(root: Element, options?: DetectOptions): DetectedBlock[] {
  const isHidden = options?.isHidden ?? (() => false);
  const doc = root.ownerDocument!;

  const blockMap = new Map<HTMLElement, string[]>();

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent: Node | null = node.parentNode;
      while (parent && parent !== root) {
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

  let textNode: Node | null;
  while ((textNode = walker.nextNode())) {
    const blockEl = getBlockParent(textNode, root);
    if (!blockEl) continue;
    if (isHidden(blockEl)) continue;

    const texts = blockMap.get(blockEl) ?? [];
    texts.push(textNode.textContent?.trim() ?? '');
    blockMap.set(blockEl, texts);
  }

  const blocks: DetectedBlock[] = [];
  for (const [el, texts] of blockMap) {
    const text = texts.join(' ').trim();
    if (!isTranslatable(text)) continue;
    blocks.push({ text, element: el, section: getPageSection(el) });
  }

  return blocks;
}
