import { useState, ReactNode } from 'react';
import styles from './Accordion.module.css';

interface AccordionProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Accordion({ title, count, defaultOpen = true, children }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={styles.accordion}>
      <button
        className={styles.header}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
        <span className={styles.title}>{title}</span>
        <span className={styles.count}>{count}</span>
      </button>
      {isOpen && <div className={styles.content}>{children}</div>}
    </div>
  );
}
