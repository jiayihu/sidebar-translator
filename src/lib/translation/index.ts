import { ChromeAITranslator, isLanguageDetectorAvailable } from './chrome-ai';
import type { ITranslator } from './types';

export type { ITranslator };

/**
 * Returns the Chrome AI translator for the given source language.
 * When sourceLang is 'auto', Chrome AI is only used if the Language Detector
 * API is also available (required for auto-detection).
 */
export async function getTranslator(sourceLang = 'auto'): Promise<ITranslator> {
  if (typeof Translator !== 'undefined') {
    const canAutoDetect = sourceLang !== 'auto' || isLanguageDetectorAvailable();
    if (canAutoDetect) {
      return new ChromeAITranslator();
    }
  }

  throw new Error(
    'Chrome built-in Translator API is not available. Please use Chrome 138+ with the Translator API enabled.',
  );
}
