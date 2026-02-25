import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings, type Settings } from '../lib/storage';

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#ffffff',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    padding: '24px',
  },
  h1: {
    margin: '0 0 4px',
    fontSize: 20,
    fontWeight: 700,
    color: '#111827',
  },
  subtitle: {
    margin: '0 0 24px',
    fontSize: 13,
    color: '#6b7280',
  },
  fieldset: {
    border: 'none',
    margin: '0 0 20px',
    padding: 0,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 4,
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 13,
    color: '#111827',
    background: '#fff',
  },
  hint: {
    marginTop: 4,
    fontSize: 11,
    color: '#9ca3af',
  },
  button: {
    padding: '8px 16px',
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  toast: {
    marginTop: 12,
    padding: '8px 12px',
    background: '#d1fae5',
    border: '1px solid #6ee7b7',
    borderRadius: 6,
    fontSize: 12,
    color: '#065f46',
  },
  section: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottom: '1px solid #f3f4f6',
  },
  sectionTitle: {
    margin: '0 0 12px',
    fontSize: 14,
    fontWeight: 600,
    color: '#374151',
  },
};

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
    <div>
      <h1 style={styles.h1}>Sidebar Translator</h1>
      <p style={styles.subtitle}>Configure translation services and default languages.</p>

      <div style={styles.card}>
        <form onSubmit={handleSave}>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Default Languages</h2>
            <fieldset style={styles.fieldset}>
              <label style={styles.label} htmlFor="sourceLang">
                Source Language (BCP 47)
              </label>
              <input
                id="sourceLang"
                style={styles.input}
                type="text"
                value={settings.sourceLanguage}
                onChange={(e) => handleChange('sourceLanguage', e.target.value)}
                placeholder="auto"
              />
              <p style={styles.hint}>Use "auto" to detect the source language automatically.</p>
            </fieldset>
            <fieldset style={styles.fieldset}>
              <label style={styles.label} htmlFor="targetLang">
                Target Language (BCP 47)
              </label>
              <input
                id="targetLang"
                style={styles.input}
                type="text"
                value={settings.targetLanguage}
                onChange={(e) => handleChange('targetLanguage', e.target.value)}
                placeholder="en"
              />
            </fieldset>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>DeepL API Key</h2>
            <fieldset style={styles.fieldset}>
              <label style={styles.label} htmlFor="deepLKey">
                API Key
              </label>
              <input
                id="deepLKey"
                style={styles.input}
                type="password"
                value={settings.deepLApiKey}
                onChange={(e) => handleChange('deepLApiKey', e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
                autoComplete="off"
              />
              <p style={styles.hint}>
                Get a free key at deepl.com/pro-api. Used when Chrome AI is unavailable.
              </p>
            </fieldset>
          </div>

          <div style={{ ...styles.section, borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
            <h2 style={styles.sectionTitle}>Google Cloud Translation API Key</h2>
            <fieldset style={styles.fieldset}>
              <label style={styles.label} htmlFor="googleKey">
                API Key
              </label>
              <input
                id="googleKey"
                style={styles.input}
                type="password"
                value={settings.googleApiKey}
                onChange={(e) => handleChange('googleApiKey', e.target.value)}
                placeholder="AIza..."
                autoComplete="off"
              />
              <p style={styles.hint}>
                Used as a fallback when Chrome AI and DeepL are both unavailable.
              </p>
            </fieldset>
          </div>

          <button type="submit" style={styles.button}>
            Save Settings
          </button>

          {saved && <div style={styles.toast}>Settings saved!</div>}
        </form>
      </div>
    </div>
  );
}
