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
  onItemMouseEnter: (id: string) => void;
  onItemMouseLeave: (id: string) => void;
  onItemClick: (id: string) => void;
}

export function TranslationList({
  blocks,
  activeId,
  flashingId,
  itemRefs,
  onItemMouseEnter,
  onItemMouseLeave,
  onItemClick,
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

  if (blocks.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyGlyph}>◇</span>
        <p className={styles.emptyText}>No text detected</p>
        <p className={styles.emptySubtext}>Navigate to a page with content</p>
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
            defaultOpen={section === 'main' || section === 'article'}
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
