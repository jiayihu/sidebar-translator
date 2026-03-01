import { forwardRef, memo, KeyboardEvent } from 'react';
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

const TranslationItemInner = forwardRef<HTMLDivElement, TranslationItemProps>(
  ({ block, isActive, isFlashing, onMouseEnter, onMouseLeave, onClick }, ref) => {
    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(block.id);
      }
    };

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        className={`${styles.item} ${isActive ? styles.active : ''} ${isFlashing ? styles.flash : ''}`}
        onMouseEnter={() => onMouseEnter(block.id)}
        onMouseLeave={() => onMouseLeave(block.id)}
        onClick={() => onClick(block.id)}
        onKeyDown={handleKeyDown}
      >
        <p className={styles.translated}>{block.translated}</p>
      </div>
    );
  },
);

TranslationItemInner.displayName = 'TranslationItem';

export const TranslationItem = memo(TranslationItemInner);
