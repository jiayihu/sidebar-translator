import { ReactNode } from 'react';
import styles from './Accordion.module.css';

interface AccordionProps {
  title: string;
  count: number;
  open: boolean;
  onToggle: (isOpen: boolean) => void;
  children: ReactNode;
}

export function Accordion({ title, count, open, onToggle, children }: AccordionProps) {
  const handleToggle = () => onToggle(!open);

  return (
    <div className={styles.accordion}>
      <button
        className={styles.header}
        onClick={handleToggle}
        aria-expanded={open}
        aria-label={`${title} section, ${count} items, ${open ? 'expanded' : 'collapsed'}`}
      >
        <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
        <span className={styles.title}>{title}</span>
        <span className={styles.count}>{count}</span>
      </button>
      {open && <div className={styles.content}>{children}</div>}
    </div>
  );
}
