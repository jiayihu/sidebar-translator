export interface TextBlock {
  id: string;
  text: string;
}

export type Message =
  | { type: 'EXTRACT_TEXT' }
  | { type: 'PAGE_TEXT'; blocks: TextBlock[]; pageLang?: string }
  | { type: 'NEW_TEXT_BLOCKS'; blocks: TextBlock[] }
  | { type: 'TEXT_UPDATED'; id: string; text: string }
  | { type: 'ELEMENT_HOVERED'; id: string | null }
  | { type: 'ELEMENT_CLICKED'; id: string }
  | { type: 'HIGHLIGHT_ELEMENT'; id: string }
  | { type: 'UNHIGHLIGHT_ELEMENT'; id: string };
