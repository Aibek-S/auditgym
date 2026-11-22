import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { STRINGS } from "./strings";
import { EXTRA } from "./strings-guide";

export type Lang = "kk" | "ru" | "en";
export const LANGS: Lang[] = ["kk", "ru", "en"];
export const LANG_LABEL: Record<Lang, string> = { kk: "KK", ru: "RU", en: "EN" };
const LANG_INDEX: Record<Lang, number> = { en: 0, ru: 1, kk: 2 };

/** Finding / evidence colours: red and blue by default, orange and blue for colour-vision deficiency. */
export type Scheme = "default" | "alt";
/** Reading comfort: text size, contrast, motion (the "View" menu). */
export type TextSize = "m" | "l" | "xl";
export type Contrast = "normal" | "high";
export type Motion = "auto" | "off";

interface Prefs {
  lang: Lang;
  setLang: (lang: Lang) => void;
  scheme: Scheme;
  setScheme: (scheme: Scheme) => void;
  size: TextSize;
  setSize: (size: TextSize) => void;
  contrast: Contrast;
  setContrast: (contrast: Contrast) => void;
  motion: Motion;
  setMotion: (motion: Motion) => void;
}

const noop = () => {};
const PrefsContext = createContext<Prefs>({
  lang: "en", setLang: noop, scheme: "default", setScheme: noop,
  size: "m", setSize: noop, contrast: "normal", setContrast: noop, motion: "auto", setMotion: noop,
});

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage can be blocked; the choice then lasts for this visit */
  }
}

export function detectLang(): Lang {
  const saved = read("auditgym.lang");
  if (saved === "kk" || saved === "ru" || saved === "en") return saved;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "kk") return "kk";
    if (base === "ru") return "ru";
    if (base === "en") return "en";
  }
  return "ru";
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const [scheme, setSchemeState] = useState<Scheme>(() => (read("auditgym.scheme") === "alt" ? "alt" : "default"));
  const [size, setSizeState] = useState<TextSize>(() => {
    const v = read("auditgym.size");
    return v === "l" || v === "xl" ? v : "m";
  });
  const [contrast, setContrastState] = useState<Contrast>(() => (read("auditgym.contrast") === "high" ? "high" : "normal"));
  const [motion, setMotionState] = useState<Motion>(() => (read("auditgym.motion") === "off" ? "off" : "auto"));

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.size = size;
    root.dataset.contrast = contrast;
    root.dataset.motion = motion;
  }, [size, contrast, motion]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.scheme = scheme;
  }, [scheme]);

  const setLang = useCallback((next: Lang) => {
    write("auditgym.lang", next);
    setLangState(next);
  }, []);
  const setScheme = useCallback((next: Scheme) => {
    write("auditgym.scheme", next);
    setSchemeState(next);
  }, []);

  const setSize = useCallback((next: TextSize) => {
    write("auditgym.size", next);
    setSizeState(next);
  }, []);
  const setContrast = useCallback((next: Contrast) => {
    write("auditgym.contrast", next);
    setContrastState(next);
  }, []);
  const setMotion = useCallback((next: Motion) => {
    write("auditgym.motion", next);
    setMotionState(next);
  }, []);

  const value = useMemo(
    () => ({ lang, setLang, scheme, setScheme, size, setSize, contrast, setContrast, motion, setMotion }),
    [lang, setLang, scheme, setScheme, size, setSize, contrast, setContrast, motion, setMotion],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  return useContext(PrefsContext);
}

export type T = (key: string, vars?: Record<string, string | number>) => string;

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const entry = STRINGS[key] ?? EXTRA[key];
  if (!entry) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key ${key}`);
    return key;
  }
  return fill(entry[LANG_INDEX[lang]] || entry[0], vars);
}

/** Plural forms are written "one|few|many" (ru), "one|other" (en); kk nouns stay singular after a number. */
export function plural(lang: Lang, key: string, n: number): string {
  const forms = translate(lang, key).split("|");
  const rule = new Intl.PluralRules(lang).select(n);
  let form = forms[0];
  if (lang === "ru") form = rule === "one" ? forms[0] : rule === "few" ? forms[1] ?? forms[0] : forms[2] ?? forms[forms.length - 1];
  else if (lang === "en") form = rule === "one" ? forms[0] : forms[1] ?? forms[0];
  return `${n} ${form}`;
}

export function useT() {
  const { lang } = usePrefs();
  const t = useCallback<T>((key, vars) => translate(lang, key, vars), [lang]);
  const n = useCallback((key: string, count: number) => plural(lang, key, count), [lang]);
  return { t, n, lang };
}
