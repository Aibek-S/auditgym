// Landing page script: fonts, the KK / RU / EN switch and the archive's counts.
// The page is written in Russian; English and Kazakh replace it in place. The choice is shared
// with the console (same localStorage key). Kazakh is a first translation: a native speaker checks it.
import "@fontsource/familjen-grotesk/400.css";
import "@fontsource/familjen-grotesk/500.css";
import "@fontsource/familjen-grotesk/600.css";
import "@fontsource/golos-text/cyrillic-400.css";
import "@fontsource/golos-text/cyrillic-500.css";
import "@fontsource/golos-text/cyrillic-600.css";
import "@fontsource/golos-text/cyrillic-ext-400.css";
import "@fontsource/golos-text/cyrillic-ext-500.css";
import "@fontsource/golos-text/cyrillic-ext-600.css";
import "@fontsource/red-hat-mono/400.css";
import "@fontsource/red-hat-mono/500.css";
import "@fontsource/fira-mono/cyrillic-400.css";
import { LANDING } from "./strings";

type Lang = "kk" | "ru" | "en";
const KEY = "auditgym.lang";

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "kk" || saved === "ru" || saved === "en") return saved;
  } catch {
    /* storage blocked */
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "kk" || base === "ru" || base === "en") return base;
  }
  return "ru";
}

const original = new Map<Element, { html?: string; aria?: string; alt?: string }>();

function remember() {
  document.querySelectorAll("[data-i18n],[data-i18n-aria],[data-i18n-alt]").forEach((el) => {
    original.set(el, {
      html: el.hasAttribute("data-i18n") ? el.innerHTML : undefined,
      aria: el.getAttribute("aria-label") ?? undefined,
      alt: el.getAttribute("alt") ?? undefined,
    });
  });
}

function apply(lang: Lang) {
  const table = lang === "ru" ? null : LANDING[lang];
  original.forEach((orig, el) => {
    const k = el.getAttribute("data-i18n");
    const ka = el.getAttribute("data-i18n-aria");
    const kalt = el.getAttribute("data-i18n-alt");
    if (k && orig.html !== undefined) el.innerHTML = table?.[k] ?? orig.html;
    if (ka) {
      const v = table?.[ka] ?? orig.aria;
      if (v !== undefined) el.setAttribute("aria-label", v);
    }
    if (kalt) {
      const v = table?.[kalt] ?? orig.alt;
      if (v !== undefined) el.setAttribute("alt", v);
    }
  });
  document.documentElement.lang = lang;
  const title = lang === "ru" ? null : LANDING[lang]?.["meta.title"];
  if (title) document.title = title;
  document.querySelectorAll<HTMLButtonElement>(".ag-lang [data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
}

function init() {
  remember();
  apply(detect());
  document.querySelectorAll<HTMLButtonElement>(".ag-lang [data-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.lang as Lang;
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* the choice lasts for this visit */
      }
      // Moments split words into spans when they mount, so a new language loads the page afresh.
      location.reload();
    });
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
