export type PageSection = 'header' | 'nav' | 'main' | 'aside' | 'footer' | 'article' | 'section' | 'other';

export interface TextBlock {
  id: string;
  text: string;
  section: PageSection;
}

export type Message =
  | { type: 'EXTRACT_TEXT' }
  | { type: 'PAGE_TEXT'; blocks: TextBlock[]; pageLang?: string }
  | { type: 'NEW_TEXT_BLOCKS'; blocks: TextBlock[] }
  | { type: 'TEXT_UPDATED'; id: string; text: string }
  | { type: 'ELEMENT_HOVERED'; id: string | null }
  | { type: 'ELEMENT_CLICKED'; id: string }
  | { type: 'HIGHLIGHT_ELEMENT'; id: string }
  | { type: 'UNHIGHLIGHT_ELEMENT'; id: string }
  | { type: 'SCROLL_TO_ELEMENT'; id: string }
  | { type: 'SET_MODE'; translationMode: boolean }
  | { type: 'MODE_CHANGED'; translationMode: boolean }
  | { type: 'BLOCK_INTERACTIVE_CHANGED'; blockInteractive: boolean }
  | { type: 'PAGE_REFRESHED' }
  | { type: 'SIDEPANEL_READY'; tabId: number };

// All known message types for validation
export const KNOWN_MESSAGE_TYPES = [
  'EXTRACT_TEXT',
  'PAGE_TEXT',
  'NEW_TEXT_BLOCKS',
  'TEXT_UPDATED',
  'ELEMENT_HOVERED',
  'ELEMENT_CLICKED',
  'HIGHLIGHT_ELEMENT',
  'UNHIGHLIGHT_ELEMENT',
  'SCROLL_TO_ELEMENT',
  'SET_MODE',
  'MODE_CHANGED',
  'BLOCK_INTERACTIVE_CHANGED',
  'PAGE_REFRESHED',
  'SIDEPANEL_READY',
] as const;

// Type guard to check if an unknown value is a valid Message
export function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg.type !== 'string') return false;
  return KNOWN_MESSAGE_TYPES.includes(msg.type as (typeof KNOWN_MESSAGE_TYPES)[number]);
}

// Individual type guards for each message type
export function isExtractText(msg: unknown): msg is { type: 'EXTRACT_TEXT' } {
  return isMessage(msg) && msg.type === 'EXTRACT_TEXT';
}

export function isPageText(msg: unknown): msg is { type: 'PAGE_TEXT'; blocks: TextBlock[]; pageLang?: string } {
  return isMessage(msg) && msg.type === 'PAGE_TEXT';
}

export function isNewTextBlocks(msg: unknown): msg is { type: 'NEW_TEXT_BLOCKS'; blocks: TextBlock[] } {
  return isMessage(msg) && msg.type === 'NEW_TEXT_BLOCKS';
}

export function isTextUpdated(msg: unknown): msg is { type: 'TEXT_UPDATED'; id: string; text: string } {
  return isMessage(msg) && msg.type === 'TEXT_UPDATED';
}

export function isElementHovered(msg: unknown): msg is { type: 'ELEMENT_HOVERED'; id: string | null } {
  return isMessage(msg) && msg.type === 'ELEMENT_HOVERED';
}

export function isElementClicked(msg: unknown): msg is { type: 'ELEMENT_CLICKED'; id: string } {
  return isMessage(msg) && msg.type === 'ELEMENT_CLICKED';
}

export function isHighlightElement(msg: unknown): msg is { type: 'HIGHLIGHT_ELEMENT'; id: string } {
  return isMessage(msg) && msg.type === 'HIGHLIGHT_ELEMENT';
}

export function isUnhighlightElement(msg: unknown): msg is { type: 'UNHIGHLIGHT_ELEMENT'; id: string } {
  return isMessage(msg) && msg.type === 'UNHIGHLIGHT_ELEMENT';
}

export function isScrollToElement(msg: unknown): msg is { type: 'SCROLL_TO_ELEMENT'; id: string } {
  return isMessage(msg) && msg.type === 'SCROLL_TO_ELEMENT';
}

export function isSetMode(msg: unknown): msg is { type: 'SET_MODE'; translationMode: boolean } {
  return isMessage(msg) && msg.type === 'SET_MODE';
}

export function isModeChanged(msg: unknown): msg is { type: 'MODE_CHANGED'; translationMode: boolean } {
  return isMessage(msg) && msg.type === 'MODE_CHANGED';
}

export function isBlockInteractiveChanged(msg: unknown): msg is { type: 'BLOCK_INTERACTIVE_CHANGED'; blockInteractive: boolean } {
  return isMessage(msg) && msg.type === 'BLOCK_INTERACTIVE_CHANGED';
}

export function isPageRefreshed(msg: unknown): msg is { type: 'PAGE_REFRESHED' } {
  return isMessage(msg) && msg.type === 'PAGE_REFRESHED';
}

export function isSidepanelReady(msg: unknown): msg is { type: 'SIDEPANEL_READY'; tabId: number } {
  return isMessage(msg) && msg.type === 'SIDEPANEL_READY';
}
