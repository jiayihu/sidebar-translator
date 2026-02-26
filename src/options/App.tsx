import { useEffect, useState } from 'react';
import { getSettings, saveSettings, type Settings } from '../lib/storage';
import styles from './App.module.css';

export default function App() {
  const [settings, setSettings] = useState<Settings>({
    targetLanguage: 'en',
    sourceLanguage: 'auto',
    deepLApiKey: '',
    googleApiKey: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const handleChange = (field: keyof Settings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <form onSubmit={handleSave}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Translate</span>
        <h1 className={styles.title}>Sidebar</h1>
        <p className={styles.subtitle}>Configure translation services and default languages.</p>
      </div>

      <div className={styles.body}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Default Languages</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="sourceLang">
              Source Language (BCP 47)
            </label>
            <input
              id="sourceLang"
              className={styles.input}
              type="text"
              value={settings.sourceLanguage}
              onChange={(e) => handleChange('sourceLanguage', e.target.value)}
              placeholder="auto"
            />
            <p className={styles.hint}>Use "auto" to detect the source language automatically.</p>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="targetLang">
              Target Language (BCP 47)
            </label>
            <input
              id="targetLang"
              className={styles.input}
              type="text"
              value={settings.targetLanguage}
              onChange={(e) => handleChange('targetLanguage', e.target.value)}
              placeholder="en"
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>DeepL API Key</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="deepLKey">
              API Key
            </label>
            <input
              id="deepLKey"
              className={styles.input}
              type="password"
              value={settings.deepLApiKey}
              onChange={(e) => handleChange('deepLApiKey', e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
              autoComplete="off"
            />
            <p className={styles.hint}>
              Get a free key at deepl.com/pro-api. Used when Chrome AI is unavailable.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Google Cloud Translation API Key</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="googleKey">
              API Key
            </label>
            <input
              id="googleKey"
              className={styles.input}
              type="password"
              value={settings.googleApiKey}
              onChange={(e) => handleChange('googleApiKey', e.target.value)}
              placeholder="AIza..."
              autoComplete="off"
            />
            <p className={styles.hint}>
              Used as a fallback when Chrome AI and DeepL are both unavailable.
            </p>
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <button type="submit" className={styles.saveBtn}>
          Save Settings
        </button>
        {saved && (
          <div className={styles.toast}>
            ✓ Settings saved
          </div>
        )}
      </div>
    </form>
  );
}
