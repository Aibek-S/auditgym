import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useT } from "../../lib/i18n";

export const TERMS = [
  "episode", "ledger", "debit_credit", "invoice", "delivery_note", "payment", "fx", "period",
  "finding", "evidence", "affected", "step", "reward", "f1",
] as const;
export type TermKey = (typeof TERMS)[number];

/** A word with a "What is this?" button: one plain sentence, and a link to the guide's glossary.
    Opens on click or Enter, closes on Escape or a click elsewhere; never on hover only. */
export function Term({ k, children }: { k: TermKey; children?: ReactNode }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span ref={box} className="relative inline">
      {children ?? t(`term.${k}.name`)}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${t("term.what")} ${t(`term.${k}.name`)}`}
        onClick={() => setOpen((v) => !v)}
        className="hit relative ml-1 inline-grid h-[18px] w-[18px] place-items-center rounded-full border border-line-strong align-[2px] text-[11px] leading-none font-semibold text-ink-secondary hover:border-ink hover:text-ink"
      >
        ?
      </button>
      {open ? (
        <span
          id={id}
          role="note"
          className="animate-rise absolute top-full left-0 z-40 mt-2 block w-[min(320px,80vw)] rounded-card border border-line-strong bg-paper-raised p-3 text-left text-[14px] leading-relaxed font-normal text-ink shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          <span className="block font-medium">{t(`term.${k}.name`)}</span>
          <span className="mt-1 block text-ink-secondary">{t(`term.${k}.def`)}</span>
          <Link to={`/console/guide#term-${k}`} className="link mt-2 inline-block text-[13px]" onClick={() => setOpen(false)}>
            {t("term.more")}
          </Link>
        </span>
      ) : null}
    </span>
  );
}
