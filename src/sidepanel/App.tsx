import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSettings, saveSettings } from '../lib/storage';
import { getTranslator } from '../lib/translation';
import { detectPageLanguage, normalizeLangCode, TranslatorDownloadRequiredError } from '../lib/translation/chrome-ai';
import type { Message, PageSection, TextBlock } from '../lib/messages';
import { LanguagePicker } from './components/LanguagePicker';
import { TranslationList } from './components/TranslationList';
import type { TranslationBlock } from './components/TranslationItem';
import styles from './App.module.css';

type Status = 'idle' | 'extracting' | 'downloading' | 'translating' | 'ready' | 'same-lang' | 'error' | 'download-required';

function scrollIntoViewIfNeeded(el: HTMLDivElement) {
  const rect = el.getBoundingClientRect();
  const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
  el.scrollIntoView({ behavior: 'smooth', block: inView ? 'nearest' : 'center' });
}

function langMatches(a: string, b: string): boolean {
  return normalizeLangCode(a) === normalizeLangCode(b);
}

async function translateRaw(
  rawBlocks: TextBlock[],
  sourceLang: string,
  targetLang: string,
  onDownloadProgress?: (progress: number) => void,
  hasUserGesture: boolean = false,
): Promise<TranslationBlock[]> {
  // Same language on both sides — return originals without hitting any API
  if (sourceLang !== 'auto' && sourceLang === targetLang) {
    return rawBlocks.map((b) => ({ id: b.id, original: b.text, translated: b.text, section: b.section }));
  }

  const translator = await getTranslator(sourceLang);
  const texts = rawBlocks.map((b) => b.text);
  const translated = await translator.translate(texts, sourceLang, targetLang, onDownloadProgress, hasUserGesture);
  return rawBlocks.map((b, i) => ({
    id: b.id,
    original: b.text,
    translated: translated[i] ?? b.text,
    section: b.section,
  }));
}

const SKELETON_COUNT = 5;

export default function App() {
  const [blocks, setBlocks] = useState<TranslationBlock[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('en');
  const [translationMode, setTranslationMode] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  // Initialize with default open sections (main and article)
  const [openSections, setOpenSections] = useState<Set<PageSection>>(() => {
    return new Set(['main', 'article'] as PageSection[]);
  });
  // Track elements that need scrolling after their section opens
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const portRef = useRef<chrome.runtime.Port | null>(null);

  // Map block IDs to their sections for quick lookup
  const blockToSection = useMemo(() => {
    const map = new Map<string, PageSection>();
    for (const block of blocks) {
      map.set(block.id, block.section);
    }
    return map;
  }, [blocks]);

  // Refs for accessing current values in port message handler
  const blockToSectionRef = useRef(blockToSection);
  const openSectionsRef = useRef(openSections);
  useEffect(() => { blockToSectionRef.current = blockToSection; }, [blockToSection]);
  useEffect(() => { openSectionsRef.current = openSections; }, [openSections]);

  // ─── Scroll to pending element after section opens ───────────────────────────
  // This effect runs after React completes the render, ensuring the element is visible
  useEffect(() => {
    if (pendingScrollId) {
      const el = itemRefs.current.get(pendingScrollId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setPendingScrollId(null);
        return; // Element found, no need for timeout
      }
      // If element still not found after section opens, clear pending after timeout
      // This prevents stale pending scrolls from blocking future ones
      const timeout = setTimeout(() => setPendingScrollId(null), 1000);
      return () => clearTimeout(timeout);
    }
  }, [openSections, pendingScrollId]);

  // Store raw blocks so language changes can re-translate without re-extracting
  const rawBlocksRef = useRef<TextBlock[]>([]);
  // <html lang> from the last extraction, used as fallback for language detection
  const pageLangRef = useRef<string | undefined>(undefined);
  // Track whether initial extraction has run
  const initializedRef = useRef(false);
  // Refs so the port message handler always sees current language values
  const sourceLangRef = useRef(sourceLang);
  const targetLangRef = useRef(targetLang);
  useEffect(() => { sourceLangRef.current = sourceLang; }, [sourceLang]);
  useEffect(() => { targetLangRef.current = targetLang; }, [targetLang]);

  // ─── Download progress callback for model downloads ─────────────────────
  const handleDownloadProgress = useCallback((progress: number) => {
    setStatus('downloading');
    setDownloadProgress(progress);
  }, []);

  // ─── Re-translate stored raw blocks with given languages ────────────────
  const retranslate = useCallback(async (src: string, tgt: string) => {
    const raw = rawBlocksRef.current;
    if (raw.length === 0) return;

    setStatus('translating');
    setBlocks([]);
    setErrorMsg('');
    setDownloadProgress(null);
    try {
      const detected = await detectPageLanguage(raw, pageLangRef.current);
      if (detected && langMatches(detected, tgt)) {
        setBlocks(raw.map((b) => ({ id: b.id, original: b.text, translated: b.text, section: b.section })));
        setStatus('same-lang');
        return;
      }
      const translated = await translateRaw(raw, src, tgt, handleDownloadProgress, false);
      setBlocks(translated);
      setStatus('ready');
    } catch (err) {
      if (err instanceof TranslatorDownloadRequiredError) {
        // Model needs download - ask user to click translate button
        setErrorMsg(err.message);
        setStatus('download-required');
        return;
      }
      console.error('[SidebarTranslator] Retranslation failed', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [handleDownloadProgress]);

  // ─── Extract from DOM + translate ───────────────────────────────────────
  const extractAndTranslate = useCallback(
    async (src: string, tgt: string) => {
      setStatus('extracting');
      setBlocks([]);
      setErrorMsg('');
      setDownloadProgress(null);
      rawBlocksRef.current = [];

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'EXTRACT_TEXT',
        } satisfies Message);
        if (!response) {
          throw new Error('Could not reach the page. Try refreshing it and reopening the translator.');
        }
        if (response.type !== 'PAGE_TEXT') {
          throw new Error('Unexpected response from content script');
        }

        const rawBlocks: TextBlock[] = response.blocks;
        rawBlocksRef.current = rawBlocks;
        pageLangRef.current = response.pageLang;

        if (rawBlocks.length === 0) {
          setStatus('ready');
          return;
        }

        const detected = await detectPageLanguage(rawBlocks, response.pageLang);
        if (detected && langMatches(detected, tgt)) {
          setBlocks(rawBlocks.map((b) => ({ id: b.id, original: b.text, translated: b.text, section: b.section })));
          setStatus('same-lang');
          return;
        }

        setStatus('translating');
        const translated = await translateRaw(rawBlocks, src, tgt, handleDownloadProgress, true);
        setBlocks(translated);
        setStatus('ready');
      } catch (err) {
        if (err instanceof TranslatorDownloadRequiredError) {
          // This shouldn't happen since we pass hasUserGesture=true, but handle it just in case
          setErrorMsg(err.message);
          setStatus('download-required');
          return;
        }
        console.error('[SidebarTranslator] Extract/translate failed', err);
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [handleDownloadProgress],
  );

  // ─── Initialize: load settings only (translation is user-triggered) ────
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    getSettings().then((s) => {
      setSourceLang(s.sourceLanguage);
      setTargetLang(s.targetLanguage);
      setFontSize(s.fontSize);
      setTranslationMode(s.translationMode);
    });
  }, []);

  // ─── Connect to background via long-lived port ───────────────────────────
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'sidepanel' });
    portRef.current = port;

    /** Ensure the accordion section for a block is open, scheduling a scroll if needed. */
    function ensureSectionOpen(id: string) {
      const section = blockToSectionRef.current.get(id);
      if (section && !openSectionsRef.current.has(section)) {
        setOpenSections((prev) => new Set(prev).add(section));
        setPendingScrollId(id);
      }
    }

    port.onMessage.addListener((message: Message) => {
      if (message.type === 'ELEMENT_HOVERED') {
        if (message.id === null) {
          setActiveId(null);
        } else {
          setActiveId(message.id);
          const el = itemRefs.current.get(message.id);
          if (el) {
            scrollIntoViewIfNeeded(el);
          } else {
            ensureSectionOpen(message.id);
          }
        }
      }

      if (message.type === 'ELEMENT_CLICKED') {
        setActiveId(message.id);
        const el = itemRefs.current.get(message.id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          ensureSectionOpen(message.id);
        }
      }

      if (message.type === 'NEW_TEXT_BLOCKS') {
        const raw = message.blocks;
        rawBlocksRef.current = [...rawBlocksRef.current, ...raw];
        const src = sourceLangRef.current;
        const tgt = targetLangRef.current;
        translateRaw(raw, src, tgt, undefined, false)
          .then((newBlocks) => {
            setBlocks((prev) => {
              const existingIds = new Set(prev.map((b) => b.id));
              const toAdd = newBlocks.filter((b) => !existingIds.has(b.id));
              return toAdd.length ? [...prev, ...toAdd] : prev;
            });
          })
          .catch((err) => {
            if (err instanceof TranslatorDownloadRequiredError) {
              // Silently ignore - user can click translate to download
              return;
            }
            console.error('[SidebarTranslator] Failed to translate new blocks', err);
          });
      }

      if (message.type === 'TEXT_UPDATED') {
        const { id, text } = message;
        const existingBlock = rawBlocksRef.current.find((b) => b.id === id);
        rawBlocksRef.current = rawBlocksRef.current.map((b) =>
          b.id === id ? { ...b, text } : b,
        );
        const src = sourceLangRef.current;
        const tgt = targetLangRef.current;
        if (existingBlock) {
          translateRaw([{ ...existingBlock, text }], src, tgt, undefined, false)
            .then(([updated]) => {
              if (!updated) return;
              setBlocks((prev) => prev.map((b) => (b.id === id ? updated : b)));
            })
            .catch((err) => {
              if (err instanceof TranslatorDownloadRequiredError) {
                // Silently ignore - user can click translate to download
                return;
              }
              console.error('[SidebarTranslator] Failed to re-translate block', id, err);
            });
        }
      }

      if (message.type === 'PAGE_REFRESHED') {
        // Reset state when page is refreshed
        setBlocks([]);
        setActiveId(null);
        setStatus('idle');
        setErrorMsg('');
        setDownloadProgress(null);
        rawBlocksRef.current = [];
        setOpenSections(new Set(['main', 'article'] as PageSection[]));
      }
    });

    return () => {
      port.disconnect();
      portRef.current = null;
    };
    // Port only needs to be created once; language values are accessed via refs below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Language change → re-translate stored blocks ───────────────────────
  const isFirstLangRender = useRef(true);
  useEffect(() => {
    // Skip the very first render (initialization handles the first translation)
    if (isFirstLangRender.current) {
      isFirstLangRender.current = false;
      return;
    }
    retranslate(sourceLang, targetLang);
  }, [sourceLang, targetLang, retranslate]);

  // ─── Sidebar ↔ page highlight ────────────────────────────────────────────
  const handleItemMouseEnter = useCallback((id: string) => {
    chrome.runtime.sendMessage({ type: 'HIGHLIGHT_ELEMENT', id } satisfies Message);
  }, []);

  const handleItemMouseLeave = useCallback((id: string) => {
    chrome.runtime.sendMessage({ type: 'UNHIGHLIGHT_ELEMENT', id } satisfies Message);
  }, []);

  const handleItemClick = useCallback((id: string) => {
    chrome.runtime.sendMessage({ type: 'SCROLL_TO_ELEMENT', id } satisfies Message);
  }, []);

  // ─── Language change handlers ─────────────────────────────────────────────
  const handleSourceChange = useCallback((lang: string) => {
    setSourceLang(lang);
    saveSettings({ sourceLanguage: lang });
  }, []);

  const handleTargetChange = useCallback((lang: string) => {
    setTargetLang(lang);
    saveSettings({ targetLanguage: lang });
  }, []);

  // ─── Translation mode toggle ───────────────────────────────────────────────
  const handleTranslationModeChange = useCallback((enabled: boolean) => {
    setTranslationMode(enabled);
    saveSettings({ translationMode: enabled });
    chrome.runtime.sendMessage({ type: 'SET_MODE', translationMode: enabled } satisfies Message);
  }, []);

  // ─── Font size control ───────────────────────────────────────────────────────
  const handleFontSizeChange = useCallback((delta: number) => {
    setFontSize((prev) => {
      const newSize = Math.max(10, Math.min(24, prev + delta));
      saveSettings({ fontSize: newSize });
      return newSize;
    });
  }, []);

  // ─── Accordion section toggle ───────────────────────────────────────────────────
  const handleSectionToggle = useCallback((section: PageSection, isOpen: boolean) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (isOpen) {
        next.add(section);
      } else {
        next.delete(section);
      }
      return next;
    });
  }, []);

  // ─── Refresh button ───────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    extractAndTranslate(sourceLangRef.current, targetLangRef.current);
  }, [extractAndTranslate]);

  const isLoading = status === 'extracting' || status === 'downloading' || status === 'translating';

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      <div className={styles.fixedHeader}>
        <LanguagePicker
          sourceLang={sourceLang}
          targetLang={targetLang}
          onSourceChange={handleSourceChange}
          onTargetChange={handleTargetChange}
          onTranslate={handleRefresh}
          isLoading={isLoading}
        />

        <div className={styles.settingsRow}>
          <label className={styles.modeToggle} title="Enable page interactions (hover highlights, click to locate)">
            <span className={styles.modeLabel}>Interactions</span>
            <input
              type="checkbox"
              className={styles.modeCheckbox}
              checked={translationMode}
              onChange={(e) => handleTranslationModeChange(e.target.checked)}
            />
            <span className={styles.modeSwitch} />
          </label>
          <div className={styles.fontSizeControl}>
            <button
              className={styles.fontSizeBtn}
              onClick={() => handleFontSizeChange(-1)}
              disabled={fontSize <= 10}
              title="Decrease font size"
            >
              −
            </button>
            <span className={styles.fontSizeValue}>A</span>
            <button
              className={styles.fontSizeBtn}
              onClick={() => handleFontSizeChange(1)}
              disabled={fontSize >= 24}
              title="Increase font size"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className={styles.scrollableContent}>
        {isLoading && (
          <div className={styles.beam}>
            <span className={styles.beamChip}>{sourceLang}</span>
            <div className={styles.beamTrack}>
              <div className={styles.beamFill} />
            </div>
            <span className={styles.beamChip}>{targetLang}</span>
          </div>
        )}

        {status === 'downloading' && downloadProgress !== null && (
          <div className={`${styles.statusBar} ${styles.info}`}>
            {downloadProgress >= 1
              ? 'Preparing translator…'
              : `Downloading language model… ${Math.round(downloadProgress * 100)}%`}
          </div>
        )}

        {status === 'same-lang' && (
          <div className={`${styles.statusBar} ${styles.info}`}>
            This page is already in the target language — showing original text.
          </div>
        )}

        {status === 'download-required' && (
          <div className={`${styles.statusBar} ${styles.info}`}>
            {errorMsg || 'A language model needs to be downloaded. Click the translate button to start.'}
          </div>
        )}

        {status === 'error' && (
          <div className={`${styles.statusBar} ${styles.error}`}>{errorMsg}</div>
        )}

        {status === 'idle' && (
          <div className={styles.idlePlaceholder}>
            <div className={styles.idleIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3 4 7l4 4" />
                <path d="M4 7h16" />
                <path d="m16 21 4-4-4-4" />
                <path d="M20 17H4" />
              </svg>
            </div>
            <p className={styles.idleText}>Press <strong>Translate page</strong> to start.</p>
          </div>
        )}

        {isLoading && blocks.length === 0 ? (
          <div className={styles.skeletonList}>
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <div
                key={i}
                className={styles.skeletonItem}
                style={{ animationDelay: `${i * 160}ms` }}
              >
                <div className={styles.skeletonLine} style={{ width: `${72 + (i % 3) * 10}%` }} />
                <div className={styles.skeletonLineShort} style={{ width: `${40 + (i % 4) * 8}%` }} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ '--translation-font-size': `${fontSize}px` } as React.CSSProperties}>
            <TranslationList
              blocks={blocks}
              activeId={activeId}
              itemRefs={itemRefs}
              openSections={openSections}
              onSectionToggle={handleSectionToggle}
              onItemMouseEnter={handleItemMouseEnter}
              onItemMouseLeave={handleItemMouseLeave}
              onItemClick={handleItemClick}
              showEmpty={status === 'ready' || status === 'same-lang'}
            />
          </div>
        )}
      </div>
    </div>
  );
}
