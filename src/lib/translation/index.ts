import { getSettings } from '../storage';
import { ChromeAITranslator, isLanguageDetectorAvailable } from './chrome-ai';
import { DeepLTranslator } from './deepl';
import { GoogleTranslator } from './google';
import type { ITranslator } from './types';

export type { ITranslator };

/**
 * Returns the best available translator for the given source language.
 * When sourceLang is 'auto', Chrome AI is only used if the Language Detector
 * API is also available (required for auto-detection). Otherwise falls through
 * to DeepL/Google which support auto-detection natively.
 */
export async function getTranslator(sourceLang = 'auto'): Promise<ITranslator> {
  if (typeof Translator !== 'undefined') {
    const canAutoDetect = sourceLang !== 'auto' || isLanguageDetectorAvailable();
    if (canAutoDetect) {
      return new ChromeAITranslator();
    }
  }

  const settings = await getSettings();

  if (settings.deepLApiKey) {
    return new DeepLTranslator(settings.deepLApiKey);
  }

  if (settings.googleApiKey) {
    return new GoogleTranslator(settings.googleApiKey);
  }

  throw new Error(
    'No translation service available. Please configure a DeepL or Google API key in the extension options, or use Chrome with built-in AI.',
  );
}
