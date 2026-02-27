import type { TextBlock } from '../messages';
import type { ITranslator } from './types';

// Augment the global scope with Chrome AI Translator + Language Detector API types
declare global {
  interface Translator {
    translate(text: string): Promise<string>;
    destroy(): void;
    /** Available input quota in characters. May be undefined in older Chrome versions. */
    inputQuota?: number;
    /** Measures how much quota the given input would consume. May be undefined in older Chrome versions. */
    measureInputUsage?(input: string): Promise<number>;
  }

  interface TranslatorCreateOptions {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }

  interface TranslatorFactory {
    availability(options: {
      sourceLanguage: string;
      targetLanguage: string;
    }): Promise<'available' | 'downloadable' | 'unsupported'>;
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

  interface LanguageDetectorCreateOptions {
    monitor?: (monitor: EventTarget) => void;
  }

  interface LanguageDetectorFactory {
    availability(): Promise<'readily' | 'downloadable' | 'no'>;
    create(options?: LanguageDetectorCreateOptions): Promise<LanguageDetector>;
  }

  // eslint-disable-next-line no-var
  var Translator: TranslatorFactory;
  // eslint-disable-next-line no-var
  var LanguageDetector: LanguageDetectorFactory | undefined;
}

export function isLanguageDetectorAvailable(): boolean {
  return 'LanguageDetector' in self;
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
  onDownloadProgress?: (progress: number) => void,
): Promise<string | null> {
  if ('LanguageDetector' in self) {
    try {
      const avail = await LanguageDetector.availability();
      if (avail !== 'no') {
        const detector = await LanguageDetector.create({
          monitor: (m) => {
            m.addEventListener('downloadprogress', (e: Event) => {
              const loaded = (e as ProgressEvent).loaded;
              console.info('[SidebarTranslator] Downloading language detector model...', loaded);
              onDownloadProgress?.(loaded);
            });
          },
        });
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

  private async detectLanguage(
    texts: string[],
    onDownloadProgress?: (progress: number) => void,
  ): Promise<string> {
    if (typeof LanguageDetector === 'undefined') {
      throw new Error(
        'Chrome AI: auto-detection requires the Language Detector API, which is not available in this browser. Please select a source language manually.',
      );
    }

    if (!this.detectorInstance) {
      this.detectorInstance = await LanguageDetector.create({
        monitor: (m) => {
          m.addEventListener('downloadprogress', (e: Event) => {
            const loaded = (e as ProgressEvent).loaded;
            console.info('[SidebarTranslator] Downloading language detector model...', loaded);
            onDownloadProgress?.(loaded);
          });
        },
      });
    }

    // Combine multiple blocks into a sample for better accuracy.
    // Docs warn that short phrases and single words have low accuracy.
    const sample = texts
      .filter((t) => t.trim())
      .slice(0, 8)
      .join(' ')
      .slice(0, 600);

    if (!sample) {
      throw new Error(
        'Chrome AI: no text available for language detection. Please select a source language manually.',
      );
    }

    const results = await this.detectorInstance.detect(sample);
    if ((results[0]?.confidence ?? 0) <= 0.5) {
      throw new Error(
        'Chrome AI: language detection confidence is too low. Please select a source language manually.',
      );
    }
    return results[0]!.detectedLanguage;
  }

  async translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    onDownloadProgress?: (progress: number) => void,
  ): Promise<string[]> {
    const actualSourceLang =
      sourceLang === 'auto' ? await this.detectLanguage(texts, onDownloadProgress) : sourceLang;

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

      if (availability === 'unsupported') {
        throw new Error(
          `Chrome AI Translator: language pair ${actualSourceLang}→${targetLang} is not available.`,
        );
      }

      translator = await Translator.create({
        sourceLanguage: actualSourceLang,
        targetLanguage: targetLang,
        // Always attach monitor: the API hides actual download status for privacy,
        // reporting all pairs as downloadable until a translator is actually created.
        monitor: (m) => {
          m.addEventListener('downloadprogress', (e: Event) => {
            const loaded = (e as ProgressEvent).loaded;
            console.info('[SidebarTranslator] Downloading language model...', loaded);
            onDownloadProgress?.(loaded);
          });
        },
      });

      this.translatorCache.set(cacheKey, translator);
    }

    const results: string[] = [];
    for (const text of texts) {
      // Check quota before translating if the API is available
      if (
        typeof translator.inputQuota === 'number' &&
        typeof translator.measureInputUsage === 'function'
      ) {
        const usage = await translator.measureInputUsage(text);
        if (usage > translator.inputQuota) {
          throw new Error(
            `Chrome AI Translator: input quota exceeded. The text requires ${usage} units but only ${translator.inputQuota} remain. Please try again later or translate a shorter selection.`,
          );
        }
      }

      const translated = await translator.translate(text);
      results.push(translated);
    }
    return results;
  }
}
