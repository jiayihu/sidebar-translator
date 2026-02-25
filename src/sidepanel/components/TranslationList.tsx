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
        <p>No text blocks found on this page.</p>
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
