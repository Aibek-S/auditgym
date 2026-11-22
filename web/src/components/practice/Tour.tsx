import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useT } from "../../lib/i18n";
import { Button } from "../ui/Button";

export interface TourStep {
  title: string;
  body: string;
  /** CSS selector of the control this step points at */
  target?: string;
  /** a button that does the step for the reader (the first step starts the month) */
  action?: { label: string; run: () => void };
  /** true once the reader has done what the step asks: the tour then moves on by itself */
  done: boolean;
}

/** A coach card in the corner. It rings the one control the step is about, moves on when the reader
    has done it, and can always be skipped. Large text, one action per step, no timers. */
export function Tour({ steps, index, onIndex, onEnd }: { steps: TourStep[]; index: number; onIndex: (n: number) => void; onEnd: () => void }) {
  const { t } = useT();
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const heading = useRef<HTMLHeadingElement>(null);
  // the card sits on the side away from the control it points at, so it never covers it
  const [side, setSide] = useState<"right" | "left">("right");

  // the step is done: move on after a short beat, so the reader sees it worked
  useEffect(() => {
    if (!step.done || last) return;
    const id = window.setTimeout(() => onIndex(index + 1), 650);
    return () => window.clearTimeout(id);
  }, [step.done, last, index, onIndex]);

  // ring the target and bring it into view
  useEffect(() => {
    if (!step.target) return;
    let el: Element | null = null;
    const find = window.setInterval(() => {
      el = document.querySelector(step.target!);
      if (el) {
        window.clearInterval(find);
        el.classList.add("tour-target");
        const r = el.getBoundingClientRect();
        setSide(r.left + r.width / 2 > window.innerWidth / 2 ? "left" : "right");
        el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    }, 150);
    return () => {
      window.clearInterval(find);
      el?.classList.remove("tour-target");
    };
  }, [step.target, index]);

  useEffect(() => {
    heading.current?.focus();
  }, [index]);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      key={index}
      className={`tour-card fixed right-4 bottom-4 left-4 z-40 rounded-card border border-ink bg-paper-raised p-5 shadow-[0_16px_40px_rgba(0,0,0,0.22)] sm:w-[420px] ${side === "right" ? "sm:left-auto" : "sm:right-auto"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-muted">
          {t("tour.label")} · {t("tour.step", { n: index + 1, total: steps.length })}
        </p>
        <button type="button" onClick={onEnd} aria-label={t("tour.end")} title={t("tour.end")} className="hit relative -mt-1 -mr-1 grid h-8 w-8 place-items-center rounded-control text-ink-muted hover:text-ink">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {steps.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= index ? "bg-ink" : "bg-line"}`} />
        ))}
      </div>
      <h2 id="tour-title" ref={heading} tabIndex={-1} className="mt-3 text-[20px] font-medium text-ink outline-none">
        {step.title}
      </h2>
      <p className="mt-2 text-[17px] leading-relaxed text-ink-secondary">{step.body}</p>
      {step.done && !last ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-medium text-verified" role="status">
          <Check size={16} aria-hidden="true" /> {t("tour.done.mark")}
        </p>
      ) : step.target && !last ? (
        <p className="mt-3 text-[14px] text-ink-muted">{t("tour.waiting")}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {step.action && !step.done ? (
          <Button variant="primary" className="!h-12 px-6 text-[16px]" onClick={step.action.run}>
            {step.action.label}
          </Button>
        ) : last ? (
          <Button variant="primary" className="!h-12 px-6 text-[16px]" onClick={onEnd}>
            {t("tour.finish")}
          </Button>
        ) : (
          <Button variant="primary" className="!h-12 px-6 text-[16px]" onClick={() => onIndex(index + 1)}>
            {t("tour.next")}
          </Button>
        )}
        {index > 0 ? (
          <Button className="!h-12 text-[16px]" onClick={() => onIndex(index - 1)}>
            {t("tour.back")}
          </Button>
        ) : null}
        <button type="button" onClick={onEnd} className="link ml-auto text-[14px] text-ink-muted">
          {t("tour.end")}
        </button>
      </div>
    </div>
  );
}
