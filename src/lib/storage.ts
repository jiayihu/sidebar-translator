export interface Settings {
  targetLanguage: string;
  sourceLanguage: string;
  deepLApiKey: string;
  googleApiKey: string;
}

const DEFAULTS: Settings = {
  targetLanguage: 'en',
  sourceLanguage: 'auto',
  deepLApiKey: '',
  googleApiKey: '',
};

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(DEFAULTS);
  return result as Settings;
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(settings);
}
