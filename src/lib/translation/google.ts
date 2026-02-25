import type { ITranslator } from './types';

const CHUNK_SIZE = 128;

export class GoogleTranslator implements ITranslator {
  constructor(private apiKey: string) {}

  async translate(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
    const results: string[] = [];

    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
      const chunk = texts.slice(i, i + CHUNK_SIZE);
      const body: Record<string, unknown> = {
        q: chunk,
        target: targetLang,
      };
      if (sourceLang !== 'auto') {
        body.source = sourceLang;
      }

      const response = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        throw new Error(`Google Translate API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        data: { translations: Array<{ translatedText: string }> };
      };
      results.push(...data.data.translations.map((t) => t.translatedText));
    }

    return results;
  }
}
