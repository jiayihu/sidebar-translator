import type React from 'react';
import { useMemo } from 'react';
import type { PageSection } from '../../lib/messages';
import { TranslationItem, type TranslationBlock } from './TranslationItem';
import { Accordion } from './Accordion';
import styles from './TranslationList.module.css';

const SECTION_LABELS: Record<PageSection, string> = {
  header: 'Header',
  nav: 'Navigation',
  main: 'Main Content',
  aside: 'Sidebar',
  footer: 'Footer',
  article: 'Article',
  section: 'Section',
  other: 'Other',
};

const SECTION_ORDER: PageSection[] = ['header', 'nav', 'main', 'article', 'section', 'aside', 'footer', 'other'];

interface TranslationListProps {
  blocks: TranslationBlock[];
  activeId: string | null;
  flashingId: string | null;
  itemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  openSections: Set<PageSection>;
  onSectionToggle: (section: PageSection, isOpen: boolean) => void;
  onItemMouseEnter: (id: string) => void;
  onItemMouseLeave: (id: string) => void;
  onItemClick: (id: string) => void;
  showEmpty?: boolean; // Only show empty state when explicitly requested
}

export function TranslationList({
  blocks,
  activeId,
  flashingId,
  itemRefs,
  openSections,
  onSectionToggle,
  onItemMouseEnter,
  onItemMouseLeave,
  onItemClick,
  showEmpty = false,
}: TranslationListProps) {
  const groupedBlocks = useMemo(() => {
    const groups = new Map<PageSection, TranslationBlock[]>();
    for (const block of blocks) {
      const existing = groups.get(block.section) ?? [];
      existing.push(block);
      groups.set(block.section, existing);
    }
    return groups;
  }, [blocks]);

  if (blocks.length === 0 && showEmpty) {
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

  // Check if there's only one section with content
  const hasMultipleSections = groupedBlocks.size > 1;

  if (!hasMultipleSections) {
    // No accordion needed for single section
    const sectionBlocks = Array.from(groupedBlocks.values())[0];
    return (
      <div className={styles.list}>
        {sectionBlocks.map((block) => (
          <TranslationItem
            key={block.id}
            ref={(el) => {
              if (el) itemRefs.current.set(block.id, el);
              else itemRefs.current.delete(block.id);
            }}
            block={block}
            isActive={activeId === block.id}
            isFlashing={flashingId === block.id}
            onMouseEnter={onItemMouseEnter}
            onMouseLeave={onItemMouseLeave}
            onClick={onItemClick}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {SECTION_ORDER.map((section) => {
        const sectionBlocks = groupedBlocks.get(section);
        if (!sectionBlocks || sectionBlocks.length === 0) return null;

        return (
          <Accordion
            key={section}
            title={SECTION_LABELS[section]}
            count={sectionBlocks.length}
            open={openSections.has(section)}
            onToggle={(isOpen) => onSectionToggle(section, isOpen)}
          >
            {sectionBlocks.map((block) => (
              <TranslationItem
                key={block.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(block.id, el);
                  else itemRefs.current.delete(block.id);
                }}
                block={block}
                isActive={activeId === block.id}
                isFlashing={flashingId === block.id}
                onMouseEnter={onItemMouseEnter}
                onMouseLeave={onItemMouseLeave}
                onClick={onItemClick}
              />
            ))}
          </Accordion>
        );
      })}
    </div>
  );
}
