export interface ITranslator {
  translate(texts: string[], sourceLang: string, targetLang: string): Promise<string[]>;
}
