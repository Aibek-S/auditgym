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

// Numbers inside the reward sentence can be dragged sideways or stepped with the arrow keys
// (after Bret Victor's Tangle); the reward is recomputed from the official formula.
function scrubs() {
  const line = document.querySelector<HTMLElement>("[data-ag-scrub]");
  if (!line) return;
  const out = line.querySelector<HTMLElement>("[data-ag-r]");
  const knobs = [...line.querySelectorAll<HTMLElement>(".ag-scrub")];
  const value = (k: string) => Number(knobs.find((el) => el.dataset.k === k)?.dataset.v ?? 0);
  const render = () => {
    const r = Math.max(-1, Math.min(1, 2 * value("f1") - 1 - 0.002 * value("s")));
    if (out) out.textContent = (r < 0 ? "−" : "") + Math.abs(r).toFixed(3);
  };
  for (const el of knobs) {
    const min = Number(el.dataset.min), max = Number(el.dataset.max), step = Number(el.dataset.step);
    const set = (v: number) => {
      const c = Math.min(max, Math.max(min, Math.round(v / step) * step));
      el.dataset.v = String(c);
      el.textContent = step < 1 ? c.toFixed(2) : String(c);
      el.setAttribute("aria-valuenow", String(c));
      render();
    };
    let start: { x: number; v: number } | null = null;
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      start = { x: e.clientX, v: Number(el.dataset.v) };
    });
    el.addEventListener("pointermove", (e) => {
      if (start) set(start.v + Math.round((e.clientX - start.x) / (step < 1 ? 8 : 4)) * step);
    });
    const end = () => (start = null);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); set(Number(el.dataset.v) + step); }
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); set(Number(el.dataset.v) - step); }
    });
  }
  render();
}

// A row of the baselines table and its point on the plot light up together.
function linkPlot() {
  const rows = document.querySelectorAll<HTMLTableRowElement>("#baseline-table tr[data-pt]");
  rows.forEach((row) => {
    const pts = document.querySelectorAll(`#baselines circle[data-pt="${row.dataset.pt}"]`);
    const on = (v: boolean) => {
      row.classList.toggle("is-hot", v);
      pts.forEach((pt) => pt.classList.toggle("is-hot", v));
    };
    row.addEventListener("mouseenter", () => on(true));
    row.addEventListener("mouseleave", () => on(false));
  });
}

function start() {
  init();
  scrubs();
  linkPlot();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
