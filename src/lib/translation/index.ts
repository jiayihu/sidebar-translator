import { getSettings } from '../storage';
import { ChromeAITranslator } from './chrome-ai';
import { DeepLTranslator } from './deepl';
import { GoogleTranslator } from './google';
import type { ITranslator } from './types';

export type { ITranslator };

export async function getTranslator(): Promise<ITranslator> {
  if (typeof Translator !== 'undefined') {
    return new ChromeAITranslator();
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
