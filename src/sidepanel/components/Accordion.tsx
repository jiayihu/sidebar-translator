import { useState, ReactNode } from 'react';
import styles from './Accordion.module.css';

interface AccordionProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  open?: boolean; // Controlled open state (takes precedence over internal state)
  children: ReactNode;
}

export function Accordion({ title, count, defaultOpen = true, open, children }: AccordionProps) {
  const [isOpenInternal, setIsOpenInternal] = useState(defaultOpen);

  // Use controlled `open` prop if provided, otherwise use internal state
  const isOpen = open !== undefined ? open : isOpenInternal;
  const handleToggle = () => setIsOpenInternal(!isOpen);

  return (
    <div className={styles.accordion}>
      <button
        className={styles.header}
        onClick={handleToggle}
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
