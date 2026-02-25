import { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings, saveSettings } from '../lib/storage';
import { getTranslator } from '../lib/translation';
import type { Message, TextBlock } from '../lib/messages';
import { LanguagePicker } from './components/LanguagePicker';
import { TranslationList } from './components/TranslationList';
import type { TranslationBlock } from './components/TranslationItem';
import styles from './App.module.css';

type Status = 'idle' | 'extracting' | 'translating' | 'ready' | 'error';

export default function App() {
  const [blocks, setBlocks] = useState<TranslationBlock[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('en');

  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const portRef = useRef<chrome.runtime.Port | null>(null);

  // ─── Load persisted settings ────────────────────────────────────────────────
  useEffect(() => {
    getSettings().then((s) => {
      setSourceLang(s.sourceLanguage);
      setTargetLang(s.targetLanguage);
    });
  }, []);

  // ─── Connect to background via long-lived port ───────────────────────────
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'sidepanel' });
    portRef.current = port;

    port.onMessage.addListener((message: Message) => {
      if (message.type === 'ELEMENT_HOVERED') {
        setActiveId(message.id);
      }

      if (message.type === 'ELEMENT_CLICKED') {
        setActiveId(message.id);
        const el = itemRefs.current.get(message.id);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      if (message.type === 'NEW_TEXT_BLOCKS') {
        translateAndAppend(message.blocks);
      }

      if (message.type === 'TEXT_UPDATED') {
        translateAndUpdate(message.id, message.text);
      }
    });

    return () => {
      port.disconnect();
      portRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceLang, targetLang]);

  // ─── Translation helpers ─────────────────────────────────────────────────
  const translateBlocks = useCallback(
    async (rawBlocks: TextBlock[]): Promise<TranslationBlock[]> => {
      const translator = await getTranslator();
      const texts = rawBlocks.map((b) => b.text);
      const translated = await translator.translate(texts, sourceLang, targetLang);
      return rawBlocks.map((b, i) => ({
        id: b.id,
        original: b.text,
        translated: translated[i] ?? b.text,
      }));
    },
    [sourceLang, targetLang],
  );

  const translateAndAppend = useCallback(
    async (rawBlocks: TextBlock[]) => {
      try {
        const newBlocks = await translateBlocks(rawBlocks);
        setBlocks((prev) => {
          const existingIds = new Set(prev.map((b) => b.id));
          const toAdd = newBlocks.filter((b) => !existingIds.has(b.id));
          return toAdd.length ? [...prev, ...toAdd] : prev;
        });
      } catch (err) {
        console.error('[SidebarTranslator] Failed to translate new blocks', err);
      }
    },
    [translateBlocks],
  );

  const translateAndUpdate = useCallback(
    async (id: string, text: string) => {
      try {
        const translator = await getTranslator();
        const [translated] = await translator.translate([text], sourceLang, targetLang);
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === id ? { ...b, original: text, translated: translated ?? text } : b,
          ),
        );
      } catch (err) {
        console.error('[SidebarTranslator] Failed to re-translate block', id, err);
      }
    },
    [sourceLang, targetLang],
  );

  // ─── Extract & translate page text ──────────────────────────────────────
  const extractAndTranslate = useCallback(async () => {
    setStatus('extracting');
    setBlocks([]);
    setErrorMsg('');

    try {
      const response = await chrome.runtime.sendMessage({ type: 'EXTRACT_TEXT' } satisfies Message);
      if (!response || response.type !== 'PAGE_TEXT') {
        throw new Error('Unexpected response from content script');
      }

      const rawBlocks: TextBlock[] = response.blocks;
      if (rawBlocks.length === 0) {
        setStatus('ready');
        return;
      }

      setStatus('translating');
      const translated = await translateBlocks(rawBlocks);
      setBlocks(translated);
      setStatus('ready');
    } catch (err) {
      console.error('[SidebarTranslator] Extract/translate failed', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [translateBlocks]);

  // ─── Auto-run on mount ───────────────────────────────────────────────────
  useEffect(() => {
    extractAndTranslate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Sidebar ↔ page highlight ────────────────────────────────────────────
  const handleItemMouseEnter = useCallback((id: string) => {
    chrome.runtime.sendMessage({ type: 'HIGHLIGHT_ELEMENT', id } satisfies Message);
  }, []);

  const handleItemMouseLeave = useCallback((id: string) => {
    chrome.runtime.sendMessage({ type: 'UNHIGHLIGHT_ELEMENT', id } satisfies Message);
  }, []);

  // ─── Language change ─────────────────────────────────────────────────────
  const handleSourceChange = useCallback((lang: string) => {
    setSourceLang(lang);
    saveSettings({ sourceLanguage: lang });
  }, []);

  const handleTargetChange = useCallback((lang: string) => {
    setTargetLang(lang);
    saveSettings({ targetLanguage: lang });
  }, []);

  // Re-translate when languages change
  useEffect(() => {
    if (status === 'ready' || status === 'error') {
      extractAndTranslate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceLang, targetLang]);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Sidebar Translator</h1>
        <button
          className={styles.refreshBtn}
          onClick={extractAndTranslate}
          disabled={status === 'extracting' || status === 'translating'}
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
      />

      {status === 'extracting' && (
        <div className={styles.statusBar}>Extracting text…</div>
      )}
      {status === 'translating' && (
        <div className={styles.statusBar}>Translating {blocks.length} blocks…</div>
      )}
      {status === 'error' && (
        <div className={`${styles.statusBar} ${styles.error}`}>{errorMsg}</div>
      )}

      <TranslationList
        blocks={blocks}
        activeId={activeId}
        itemRefs={itemRefs}
        onItemMouseEnter={handleItemMouseEnter}
        onItemMouseLeave={handleItemMouseLeave}
      />
    </div>
  );
}
