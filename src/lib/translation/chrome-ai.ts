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
          return normalizeLangCode(results[0]!.detectedLanguage);
        }
      }
    } catch {
      // fall through to pageLang
    }
  }
  return pageLang ? normalizeLangCode(pageLang) : null;
}

/** Normalize language code to base form (e.g., 'it-IT' → 'it', 'zh-TW' stays as-is) */
export function normalizeLangCode(code: string): string {
  // Preserve zh-TW, zh-HK, etc. as they are distinct Chinese variants
  if (code.startsWith('zh-')) return code;
  // For other codes, take only the base language part
  return code.toLowerCase().split('-')[0]!;
}

/** Error thrown when the translator model needs to be downloaded but no user gesture is available */
export class TranslatorDownloadRequiredError extends Error {
  constructor(
    public readonly sourceLang: string,
    public readonly targetLang: string,
  ) {
    super(
      `The translation model for ${sourceLang} → ${targetLang} needs to be downloaded. Click the translate button to start the download.`,
    );
    this.name = 'TranslatorDownloadRequiredError';
  }
}

export class ChromeAITranslator implements ITranslator {
  private translatorCache = new Map<string, Translator>();
  private detectorInstance: LanguageDetector | null = null;

  /**
   * Check if a translator for the given language pair requires a download.
   * Returns 'available' if cached or ready, 'downloadable' if needs download,
   * or 'unsupported' if the pair is not supported.
   */
  async checkAvailability(
    sourceLang: string,
    targetLang: string,
  ): Promise<'available' | 'downloadable' | 'unsupported'> {
    const cacheKey = `${sourceLang}:${targetLang}`;
    if (this.translatorCache.has(cacheKey)) {
      return 'available';
    }

    return Translator.availability({
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
    });
  }

  private async detectLanguage(
    texts: string[],
    onDownloadProgress?: (progress: number) => void,
  ): Promise<string> {
    if (typeof LanguageDetector === 'undefined') {
      throw new Error(
        'Chrome AI: auto-detection requires the Language Detector API, which is not available in this browser. Please select a source language manually.',
      );
    }

    try {
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
    } catch (err) {
      // If detection fails (e.g., NotSupportedError during download), provide helpful message
      if (err instanceof Error && (err.name === 'NotSupportedError' || err.message.includes('Unable to create'))) {
        throw new Error(
          'Chrome AI: language detection is not available. Please select a source language manually.',
        );
      }
      throw err;
    }
  }

  async translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    onDownloadProgress?: (progress: number) => void,
    hasUserGesture: boolean = false,
  ): Promise<string[]> {
    const rawSourceLang =
      sourceLang === 'auto' ? await this.detectLanguage(texts, onDownloadProgress) : sourceLang;

    // Normalize language codes (e.g., 'it-IT' → 'it')
    const actualSourceLang = normalizeLangCode(rawSourceLang);
    const normalizedTargetLang = normalizeLangCode(targetLang);

    console.info('[SidebarTranslator] Translating', actualSourceLang, '→', normalizedTargetLang);

    // Source and target are the same language — return originals unchanged
    if (actualSourceLang === normalizedTargetLang) {
      return texts;
    }

    const cacheKey = `${actualSourceLang}:${normalizedTargetLang}`;
    let translator = this.translatorCache.get(cacheKey);

    if (!translator) {
      const availability = await Translator.availability({
        sourceLanguage: actualSourceLang,
        targetLanguage: normalizedTargetLang,
      });

      if (availability === 'unsupported') {
        throw new Error(
          `Chrome AI Translator: language pair ${actualSourceLang}→${normalizedTargetLang} is not available.`,
        );
      }

      // If the model needs to be downloaded and we don't have a user gesture,
      // throw a special error that the UI can handle
      // Note: 'downloading' is not in the official TypeScript types but Chrome may
      // return it in some cases, so we handle it defensively alongside 'downloadable'
      if ((availability === 'downloadable' || availability === 'downloading') && !hasUserGesture) {
        throw new TranslatorDownloadRequiredError(actualSourceLang, normalizedTargetLang);
      }

      try {
        console.info('[SidebarTranslator] Creating translator for', actualSourceLang, '→', normalizedTargetLang);
        translator = await Translator.create({
          sourceLanguage: actualSourceLang,
          targetLanguage: normalizedTargetLang,
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
        console.info('[SidebarTranslator] Translator created successfully');
      } catch (createError: unknown) {
        // Log the full error for debugging
        console.error('[SidebarTranslator] Translator.create() failed:', createError);

        const errorObj = createError as Error | undefined;
        const errorMsg = errorObj?.message ?? String(createError);
        const errorName = errorObj?.name ?? '';

        // Handle "user gesture required" error - this means the model needs to be downloaded
        // and the user gesture wasn't valid or expired
        if (errorName === 'NotAllowedError' || errorMsg.includes('user gesture')) {
          throw new TranslatorDownloadRequiredError(actualSourceLang, normalizedTargetLang);
        }

        // Handle "not supported" errors - only for actual unsupported language pairs
        if (
          errorName === 'NotSupportedError' ||
          errorMsg.includes('Unable to create translator')
        ) {
          throw new Error(
            `Chrome AI Translator: the language pair ${actualSourceLang}→${normalizedTargetLang} is not supported. Please try a different source or target language.`,
          );
        }

        // Re-throw other errors with more context
        throw new Error(
          `Chrome AI Translator error: ${errorMsg}. Try refreshing the page and clicking translate again.`,
        );
      }

      this.translatorCache.set(cacheKey, translator);
    }

    console.info('[SidebarTranslator] Starting translation of', texts.length, 'texts');
    const results: string[] = [];
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
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
      console.info('[SidebarTranslator] Translated', i + 1, '/', texts.length);
    }
    console.info('[SidebarTranslator] All translations complete');
    return results;
  }
}
