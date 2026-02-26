import type { TextBlock } from '../messages';
import type { ITranslator } from './types';

// Augment the global scope with Chrome AI Translator + Language Detector API types
declare global {
  interface Translator {
    translate(text: string): Promise<string>;
    destroy(): void;
  }

  interface TranslatorCreateOptions {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }

  interface TranslatorFactory {
    availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
    create(options: TranslatorCreateOptions): Promise<Translator>;
  }

  interface LanguageDetectionResult {
    detectedLanguage: string;
    confidence: number;
  }

  interface LanguageDetector {
    detect(text: string): Promise<LanguageDetectionResult[]>;
    destroy(): void;
  }

  interface LanguageDetectorFactory {
    availability(): Promise<string>;
    create(): Promise<LanguageDetector>;
  }

  // eslint-disable-next-line no-var
  var Translator: TranslatorFactory;
  // eslint-disable-next-line no-var
  var LanguageDetector: LanguageDetectorFactory | undefined;
}

export function isLanguageDetectorAvailable(): boolean {
  return typeof LanguageDetector !== 'undefined';
}

/**
 * Best-effort page language detection.
 * Tries Chrome AI LanguageDetector on a text sample, falls back to the
 * <html lang> attribute supplied by the content script.
 * Returns null if neither source is available.
 */
export async function detectPageLanguage(
  blocks: TextBlock[],
  pageLang: string | undefined,
): Promise<string | null> {
  if (typeof LanguageDetector !== 'undefined') {
    try {
      const avail = await LanguageDetector.availability();
      if (avail !== 'unavailable') {
        const detector = await LanguageDetector.create();
        const sample = blocks.slice(0, 8).map((b) => b.text).join(' ').slice(0, 600);
        const results = await detector.detect(sample);
        detector.destroy();
        if ((results[0]?.confidence ?? 0) > 0.5) {
          return results[0]!.detectedLanguage;
        }
      }
    } catch {
      // fall through to pageLang
    }
  }
  return pageLang ?? null;
}

export class ChromeAITranslator implements ITranslator {
  private translatorCache = new Map<string, Translator>();
  private detectorInstance: LanguageDetector | null = null;

  private async detectLanguage(texts: string[]): Promise<string> {
    if (typeof LanguageDetector === 'undefined') {
      throw new Error(
        'Chrome AI: auto-detection requires the Language Detector API, which is not available in this browser. Please select a source language manually.',
      );
    }

    if (!this.detectorInstance) {
      this.detectorInstance = await LanguageDetector.create();
    }

    const sampleText = texts.find((t) => t.trim()) ?? '';
    const results = await this.detectorInstance.detect(sampleText);
    return results[0]?.detectedLanguage ?? 'en';
  }

  async translate(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
    const actualSourceLang =
      sourceLang === 'auto' ? await this.detectLanguage(texts) : sourceLang;

    // Source and target are the same language — return originals unchanged
    if (actualSourceLang === targetLang) {
      return texts;
    }

    const cacheKey = `${actualSourceLang}:${targetLang}`;
    let translator = this.translatorCache.get(cacheKey);

    if (!translator) {
      const availability = await Translator.availability({
        sourceLanguage: actualSourceLang,
        targetLanguage: targetLang,
      });

      if (availability === 'unavailable') {
        throw new Error(
          `Chrome AI Translator: language pair ${actualSourceLang}→${targetLang} is not available.`,
        );
      }

      translator = await Translator.create({
        sourceLanguage: actualSourceLang,
        targetLanguage: targetLang,
        monitor:
          availability === 'downloadable'
            ? (m) => {
                m.addEventListener('downloadprogress', (e) => {
                  console.info('[SidebarTranslator] Downloading language model...', e);
                });
              }
            : undefined,
      });

      this.translatorCache.set(cacheKey, translator);
    }

    const results: string[] = [];
    for (const text of texts) {
      const translated = await translator.translate(text);
      results.push(translated);
    }
    return results;
  }
}
