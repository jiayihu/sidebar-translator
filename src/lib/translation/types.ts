export interface ITranslator {
  translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    onDownloadProgress?: (progress: number) => void,
  ): Promise<string[]>;
}
