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

// The penalty line: every guided run has F1 = 1, so its point sits on R = 1 - 0.002·S. The line draws
// from the oracle's point, then each run slides down it to its step count while its reward counts down
// by 0.002 a step; the run's table row lights as it lands. Once, when the plot comes into view, then it
// rests in its finished state (also the reduced-motion and no-script view).
function slopePlot() {
  const svg = document.querySelector<SVGSVGElement>("svg[data-ag-slope]");
  if (!svg || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const line = svg.querySelector<SVGLineElement>(".ag-slope")!;
  const tick = svg.querySelector<SVGTextElement>(".ag-rtick")!;
  const len = Math.hypot(363 - 48, 176 - 20);
  const X = (s: number) => 48 + 26.25 * s;
  const Y = (s: number) => 20 + 6500 * 0.002 * s;
  const runs = new Map<number, SVGCircleElement[]>();
  svg.querySelectorAll<SVGCircleElement>("circle[data-pt]").forEach((c) => {
    const s = Math.round((Number(c.getAttribute("cx")) - 48) / 26.25);
    runs.set(s, [...(runs.get(s) ?? []), c]);
  });
  const order = [...runs.keys()].sort((a, b) => a - b);
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  let playing = false;

  const frame = (fn: (t: number) => void, ms: number) =>
    new Promise<void>((done) => {
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        fn(t);
        if (t < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const place = (c: SVGCircleElement, s: number) => {
    const dx = X(s) - Number(c.getAttribute("cx"));
    const dy = Y(s) - Number(c.getAttribute("cy"));
    c.setAttribute("transform", `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
  };

  async function round() {
    // reset: every run back on the oracle's point, the line undrawn
    runs.forEach((cs) => cs.forEach((c) => { place(c, 0); c.style.opacity = "0"; }));
    line.style.strokeDasharray = `${len}`;
    line.style.strokeDashoffset = `${len}`;
    await frame((t) => (line.style.strokeDashoffset = `${len * (1 - ease(t))}`), 700);
    line.style.strokeDasharray = "4 4";
    line.style.strokeDashoffset = "0";
    for (const target of order) {
      const cs = runs.get(target)!;
      cs.forEach((c) => (c.style.opacity = "1"));
      tick.setAttribute("opacity", "1");
      await frame((t) => {
        const s = target * ease(t);
        cs.forEach((c) => place(c, s));
        const r = 1 - 0.002 * Math.round(s);
        tick.textContent = r.toFixed(3);
        tick.setAttribute("x", (X(s) + 10).toFixed(1));
        tick.setAttribute("y", (Y(s) - 10).toFixed(1));
      }, 420 + target * 60);
      cs.forEach((c) => {
        const row = document.querySelector(`#baseline-table tr[data-pt="${c.dataset.pt}"]`);
        row?.classList.add("is-land");
        setTimeout(() => row?.classList.remove("is-land"), 900);
      });
      await wait(160);
    }
    tick.setAttribute("opacity", "0");
    await wait(1400);
  }

  async function play(rounds: number) {
    if (playing) return;
    playing = true;
    for (let i = 0; i < rounds; i++) await round();
    runs.forEach((cs) => cs.forEach((c) => { c.removeAttribute("transform"); c.style.opacity = ""; }));
    playing = false;
  }

  let seen = false;
  new IntersectionObserver((entries) => {
    if (!seen && entries.some((e) => e.isIntersecting)) {
      seen = true;
      play(1);
    }
  }, { threshold: 0.6 }).observe(svg);
}

// The hero window's tabs switch between the month's ledger, invoices and payments (arrow keys too).
function windowTabs() {
  const win = document.querySelector<HTMLElement>("[data-ag-tabs]");
  if (!win) return;
  const tabs = [...win.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const file = win.querySelector<HTMLElement>("[data-ag-file]");
  const select = (tab: HTMLButtonElement, focus = false) => {
    for (const t of tabs) {
      const on = t === tab;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = win.querySelector<HTMLElement>(`[data-panel="${t.dataset.tab}"]`);
      if (panel) panel.hidden = !on;
      const key = win.querySelector<HTMLElement>(`[data-key="${t.dataset.tab}"]`);
      if (key) key.hidden = !on;
    }
    if (file && tab.dataset.file) file.textContent = tab.dataset.file;
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); select(tabs[(i + 1) % tabs.length], true); }
      if (e.key === "ArrowLeft") { e.preventDefault(); select(tabs[(i - 1 + tabs.length) % tabs.length], true); }
    });
  });
}

// Every moving picture on the page plays once and stays finished: the step boxes build when they are
// first seen (a third on screen), the terminal's output included, and nothing replays them.
// Phones and reduced motion get the finished picture.
function playOnce() {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(max-width: 639px)").matches;
  for (const box of document.querySelectorAll<HTMLElement>("[data-ag-steps]")) {
    const items = [...box.querySelectorAll<HTMLElement>("[data-step]")]
      .map((el, i) => ({ el, at: el.dataset.stepAt != null ? parseFloat(el.dataset.stepAt) : i }))
      .sort((a, b) => a.at - b.at)
      .map((o) => o.el);
    if (still || !items.length) continue;
    const every = parseInt(box.dataset.agSteps ?? "", 10) || 700;
    const first = box.closest(".hero") ? 900 : 200;   // in the hero, after its entrance
    items.forEach((el) => el.classList.add("is-off"));
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      items.forEach((el, k) => setTimeout(() => el.classList.remove("is-off"), first + k * every));
    }, { threshold: 0.3 });
    io.observe(box);
  }
}

function start() {
  init();
  windowTabs();
  playOnce();
  scrubs();
  linkPlot();
  slopePlot();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
