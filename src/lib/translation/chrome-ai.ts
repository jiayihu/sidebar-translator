import type { ITranslator } from './types';

// Augment the global scope with Chrome AI Translator API types
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

  // eslint-disable-next-line no-var
  var Translator: TranslatorFactory;
}

export class ChromeAITranslator implements ITranslator {
  private cache = new Map<string, Translator>();

  async translate(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
    const cacheKey = `${sourceLang}:${targetLang}`;
    let translator = this.cache.get(cacheKey);

    if (!translator) {
      const availability = await Translator.availability({
        sourceLanguage: sourceLang === 'auto' ? 'und' : sourceLang,
        targetLanguage: targetLang,
      });

      if (availability === 'unavailable') {
        throw new Error(`Chrome AI Translator: language pair ${sourceLang}→${targetLang} unavailable`);
      }

      translator = await Translator.create({
        sourceLanguage: sourceLang === 'auto' ? 'und' : sourceLang,
        targetLanguage: targetLang,
        monitor: availability === 'downloadable'
          ? (m) => {
              m.addEventListener('downloadprogress', (e) => {
                console.info('[SidebarTranslator] Downloading language model...', e);
              });
            }
          : undefined,
      });

      this.cache.set(cacheKey, translator);
    }

    const results: string[] = [];
    for (const text of texts) {
      const translated = await translator.translate(text);
      results.push(translated);
    }
    return results;
  }
}
