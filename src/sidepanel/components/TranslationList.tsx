import type React from 'react';
import { TranslationItem, type TranslationBlock } from './TranslationItem';
import styles from './TranslationList.module.css';

interface TranslationListProps {
  blocks: TranslationBlock[];
  activeId: string | null;
  itemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onItemMouseEnter: (id: string) => void;
  onItemMouseLeave: (id: string) => void;
}

export function TranslationList({
  blocks,
  activeId,
  itemRefs,
  onItemMouseEnter,
  onItemMouseLeave,
}: TranslationListProps) {
  if (blocks.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyGlyph}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </span>
        <p className={styles.emptyText}>No translatable text found</p>
        <p className={styles.emptySubtext}>Try a different page</p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {blocks.map((block) => (
        <TranslationItem
          key={block.id}
          ref={(el) => {
            if (el) itemRefs.current.set(block.id, el);
            else itemRefs.current.delete(block.id);
          }}
          block={block}
          isActive={activeId === block.id}
          onMouseEnter={onItemMouseEnter}
          onMouseLeave={onItemMouseLeave}
        />
      ))}
    </div>
  );
}
