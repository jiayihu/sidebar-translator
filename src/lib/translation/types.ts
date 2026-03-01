export interface ITranslator {
  translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    onDownloadProgress?: (progress: number) => void,
    hasUserGesture?: boolean,
  ): Promise<string[]>;

  checkAvailability(
    sourceLang: string,
    targetLang: string,
  ): Promise<'available' | 'downloadable' | 'unsupported'>;
}
