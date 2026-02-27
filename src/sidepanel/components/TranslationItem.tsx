import { forwardRef } from 'react';
import type { PageSection } from '../../lib/messages';
import styles from './TranslationItem.module.css';

export interface TranslationBlock {
  id: string;
  original: string;
  translated: string;
  section: PageSection;
}

interface TranslationItemProps {
  block: TranslationBlock;
  isActive: boolean;
  isFlashing: boolean;
  onMouseEnter: (id: string) => void;
  onMouseLeave: (id: string) => void;
  onClick: (id: string) => void;
}

export const TranslationItem = forwardRef<HTMLDivElement, TranslationItemProps>(
  ({ block, isActive, isFlashing, onMouseEnter, onMouseLeave, onClick }, ref) => {
    return (
      <div
        ref={ref}
        className={`${styles.item} ${isActive ? styles.active : ''} ${isFlashing ? styles.flash : ''}`}
        onMouseEnter={() => onMouseEnter(block.id)}
        onMouseLeave={() => onMouseLeave(block.id)}
        onClick={() => onClick(block.id)}
      >
        <p className={styles.translated}>{block.translated}</p>
        <p className={styles.original}>{block.original}</p>
      </div>
    );
  },
);

TranslationItem.displayName = 'TranslationItem';
