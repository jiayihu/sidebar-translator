import { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings, saveSettings } from '../lib/storage';
import { getTranslator } from '../lib/translation';
import type { Message, TextBlock } from '../lib/messages';
import { LanguagePicker } from './components/LanguagePicker';
import { TranslationList } from './components/TranslationList';
import type { TranslationBlock } from './components/TranslationItem';
import styles from './App.module.css';

type Status = 'idle' | 'extracting' | 'translating' | 'ready' | 'error';

async function translateRaw(
  rawBlocks: TextBlock[],
  sourceLang: string,
  targetLang: string,
): Promise<TranslationBlock[]> {
  // Same language on both sides — return originals without hitting any API
  if (sourceLang !== 'auto' && sourceLang === targetLang) {
    return rawBlocks.map((b) => ({ id: b.id, original: b.text, translated: b.text }));
  }

  const translator = await getTranslator(sourceLang);
  const texts = rawBlocks.map((b) => b.text);
  const translated = await translator.translate(texts, sourceLang, targetLang);
  return rawBlocks.map((b, i) => ({
    id: b.id,
    original: b.text,
    translated: translated[i] ?? b.text,
  }));
}

const SKELETON_COUNT = 5;

export default function App() {
  const [blocks, setBlocks] = useState<TranslationBlock[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('en');

  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const portRef = useRef<chrome.runtime.Port | null>(null);
  // Store raw blocks so language changes can re-translate without re-extracting
  const rawBlocksRef = useRef<TextBlock[]>([]);
  // Track whether initial extraction has run
  const initializedRef = useRef(false);

  // ─── Re-translate stored raw blocks with given languages ────────────────
  const retranslate = useCallback(async (src: string, tgt: string) => {
    const raw = rawBlocksRef.current;
    if (raw.length === 0) return;

    setStatus('translating');
    setBlocks([]);
    setErrorMsg('');
    try {
      const translated = await translateRaw(raw, src, tgt);
      setBlocks(translated);
      setStatus('ready');
    } catch (err) {
      console.error('[SidebarTranslator] Retranslation failed', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  // ─── Extract from DOM + translate ───────────────────────────────────────
  const extractAndTranslate = useCallback(
    async (src: string, tgt: string) => {
      setStatus('extracting');
      setBlocks([]);
      setErrorMsg('');
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

        if (rawBlocks.length === 0) {
          setStatus('ready');
          return;
        }

        setStatus('translating');
        const translated = await translateRaw(rawBlocks, src, tgt);
        setBlocks(translated);
        setStatus('ready');
      } catch (err) {
        console.error('[SidebarTranslator] Extract/translate failed', err);
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [],
  );

  // ─── Initialize: load settings, then extract ────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    getSettings().then((s) => {
      const src = s.sourceLanguage;
      const tgt = s.targetLanguage;
      setSourceLang(src);
      setTargetLang(tgt);
      extractAndTranslate(src, tgt);
    });
  }, [extractAndTranslate]);

  // ─── Connect to background via long-lived port ───────────────────────────
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'sidepanel' });
    portRef.current = port;

    port.onMessage.addListener((message: Message) => {
      if (message.type === 'ELEMENT_HOVERED') {
        if (message.id === null) {
          setActiveId(null);
        } else {
          const el = itemRefs.current.get(message.id);
          if (el) {
            setActiveId(message.id);
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }

      if (message.type === 'ELEMENT_CLICKED') {
        setActiveId(message.id);
        const el = itemRefs.current.get(message.id);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      if (message.type === 'NEW_TEXT_BLOCKS') {
        const raw = message.blocks;
        rawBlocksRef.current = [...rawBlocksRef.current, ...raw];
        const src = sourceLangRef.current;
        const tgt = targetLangRef.current;
        translateRaw(raw, src, tgt)
          .then((newBlocks) => {
            setBlocks((prev) => {
              const existingIds = new Set(prev.map((b) => b.id));
              const toAdd = newBlocks.filter((b) => !existingIds.has(b.id));
              return toAdd.length ? [...prev, ...toAdd] : prev;
            });
          })
          .catch((err) => console.error('[SidebarTranslator] Failed to translate new blocks', err));
      }

      if (message.type === 'TEXT_UPDATED') {
        const { id, text } = message;
        rawBlocksRef.current = rawBlocksRef.current.map((b) =>
          b.id === id ? { ...b, text } : b,
        );
        const src = sourceLangRef.current;
        const tgt = targetLangRef.current;
        translateRaw([{ id, text }], src, tgt)
          .then(([updated]) => {
            if (!updated) return;
            setBlocks((prev) => prev.map((b) => (b.id === id ? updated : b)));
          })
          .catch((err) =>
            console.error('[SidebarTranslator] Failed to re-translate block', id, err),
          );
      }
    });

    return () => {
      port.disconnect();
      portRef.current = null;
    };
    // Port only needs to be created once; language values are accessed via refs below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refs so the port message handler always sees current language values
  const sourceLangRef = useRef(sourceLang);
  const targetLangRef = useRef(targetLang);
  useEffect(() => { sourceLangRef.current = sourceLang; }, [sourceLang]);
  useEffect(() => { targetLangRef.current = targetLang; }, [targetLang]);

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

  // ─── Language change handlers ─────────────────────────────────────────────
  const handleSourceChange = useCallback((lang: string) => {
    setSourceLang(lang);
    saveSettings({ sourceLanguage: lang });
  }, []);

  const handleTargetChange = useCallback((lang: string) => {
    setTargetLang(lang);
    saveSettings({ targetLanguage: lang });
  }, []);

  // ─── Refresh button ───────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    extractAndTranslate(sourceLangRef.current, targetLangRef.current);
  }, [extractAndTranslate]);

  const isLoading = status === 'idle' || status === 'extracting' || status === 'translating';

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.titleEyebrow}>Translate</span>
          <h1 className={styles.title}>Sidebar</h1>
        </div>
        <button
          className={`${styles.refreshBtn} ${isLoading ? styles.refreshBtnLoading : ''}`}
          onClick={handleRefresh}
          disabled={isLoading}
          title="Re-scan and translate page"
        >
          ↺
        </button>
      </header>

      <LanguagePicker
        sourceLang={sourceLang}
        targetLang={targetLang}
        onSourceChange={handleSourceChange}
        onTargetChange={handleTargetChange}
        onTranslate={handleRefresh}
        isLoading={isLoading}
      />

      {isLoading && (
        <div className={styles.beam}>
          <span className={styles.beamChip}>{sourceLang}</span>
          <div className={styles.beamTrack}>
            <div className={styles.beamFill} />
          </div>
          <span className={styles.beamChip}>{targetLang}</span>
        </div>
      )}

      {status === 'error' && (
        <div className={`${styles.statusBar} ${styles.error}`}>{errorMsg}</div>
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
        <TranslationList
          blocks={blocks}
          activeId={activeId}
          itemRefs={itemRefs}
          onItemMouseEnter={handleItemMouseEnter}
          onItemMouseLeave={handleItemMouseLeave}
        />
      )}
    </div>
  );
}
