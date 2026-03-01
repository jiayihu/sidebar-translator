export interface Settings {
  targetLanguage: string;
  sourceLanguage: string;
  blockInteractive: boolean;
  fontSize: number;
  translationMode: boolean;
}

const DEFAULTS: Settings = {
  targetLanguage: 'en',
  sourceLanguage: 'auto',
  blockInteractive: false,
  fontSize: 14,
  translationMode: true,
};

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(DEFAULTS);
  return result as Settings;
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(settings);
}
