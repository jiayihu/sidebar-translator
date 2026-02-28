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
  | { type: 'PAGE_REFRESHED' };
