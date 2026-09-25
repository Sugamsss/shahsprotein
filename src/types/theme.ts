export type Theme = 'dark' | 'light';

/** A saved choice, or 'system': follow the device, nothing saved. */
export type ThemeMode = Theme | 'system';

export interface ThemeContextType {
  /** What's on screen. */
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Saves the opposite of what's on screen. */
  toggleTheme: () => void;
  /** Saves this theme. */
  setTheme: (theme: Theme) => void;
}
