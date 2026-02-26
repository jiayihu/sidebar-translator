import type { ITranslator } from './types';

const CHUNK_SIZE = 50;

function getEndpoint(apiKey: string): string {
  return apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

export class DeepLTranslator implements ITranslator {
  constructor(private apiKey: string) {}

  async translate(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
    const results: string[] = [];
    const endpoint = getEndpoint(this.apiKey);

    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
      const chunk = texts.slice(i, i + CHUNK_SIZE);
      const body: Record<string, unknown> = {
        text: chunk,
        target_lang: targetLang.toUpperCase(),
      };
      if (sourceLang !== 'auto') {
        body.source_lang = sourceLang.toUpperCase();
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`DeepL API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { translations: Array<{ text: string }> };
      results.push(...data.translations.map((t) => t.text));
    }

    return results;
  }
}
