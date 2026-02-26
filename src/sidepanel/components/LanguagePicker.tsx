import styles from './LanguagePicker.module.css';

const LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'tr', label: 'Turkish' },
  { code: 'sv', label: 'Swedish' },
  { code: 'da', label: 'Danish' },
  { code: 'fi', label: 'Finnish' },
  { code: 'nb', label: 'Norwegian' },
];

interface LanguagePickerProps {
  sourceLang: string;
  targetLang: string;
  onSourceChange: (lang: string) => void;
  onTargetChange: (lang: string) => void;
  onTranslate: () => void;
  isLoading: boolean;
}

export function LanguagePicker({ sourceLang, targetLang, onSourceChange, onTargetChange, onTranslate, isLoading }: LanguagePickerProps) {
  return (
    <div className={styles.container}>
      <div className={styles.selectWrapper}>
        <span className={styles.label}>From</span>
        <select
          className={styles.select}
          value={sourceLang}
          onChange={(e) => onSourceChange(e.target.value)}
          aria-label="Source language"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      <span className={styles.arrow}>→</span>

      <div className={styles.selectWrapper}>
        <span className={styles.label}>To</span>
        <select
          className={styles.select}
          value={targetLang}
          onChange={(e) => onTargetChange(e.target.value)}
          aria-label="Target language"
        >
          {LANGUAGES.filter((l) => l.code !== 'auto').map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      <button
        className={styles.translateBtn}
        onClick={onTranslate}
        disabled={isLoading}
        title="Translate page"
      >
        ▶
      </button>
    </div>
  );
}
