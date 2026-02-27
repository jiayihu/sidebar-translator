import { forwardRef } from 'react';
import styles from './TranslationItem.module.css';

export interface TranslationBlock {
  id: string;
  original: string;
  translated: string;
}

interface TranslationItemProps {
  block: TranslationBlock;
  isActive: boolean;
  onMouseEnter: (id: string) => void;
  onMouseLeave: (id: string) => void;
}

export const TranslationItem = forwardRef<HTMLDivElement, TranslationItemProps>(
  ({ block, isActive, onMouseEnter, onMouseLeave }, ref) => {
    return (
      <div
        ref={ref}
        className={`${styles.item} ${isActive ? styles.active : ''}`}
        onMouseEnter={() => onMouseEnter(block.id)}
        onMouseLeave={() => onMouseLeave(block.id)}
      >
        <p className={styles.translated}>{block.translated}</p>
      </div>
    );
  },
);

TranslationItem.displayName = 'TranslationItem';
