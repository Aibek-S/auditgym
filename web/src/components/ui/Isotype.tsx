import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useT } from "../../lib/i18n";

// Isotype rule: a quantity is a count of same-size marks, never a bigger mark.
// One mark per planted error: found (filled), missed (outline); a false finding is an outline with a cross.
export type MarkState = "found" | "missed" | "false";

export interface Mark {
  id: string;
  state: MarkState;
  label: string;
  to?: string;
}

function Glyph({ state }: { state: MarkState }) {
  if (state === "found") return <span className="block h-3.5 w-3.5 rounded-[1px] bg-ink" />;
  if (state === "missed") return <span className="block h-3.5 w-3.5 rounded-[1px] border-2 border-ink" />;
  return (
    <svg viewBox="0 0 14 14" className="block h-3.5 w-3.5 text-finding" aria-hidden="true">
      <rect x="1" y="1" width="12" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function Marks({ marks }: { marks: Mark[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {marks.map((mark) => {
        const body = <Glyph state={mark.state} />;
        return mark.to ? (
          <Link key={mark.id} to={mark.to} aria-label={mark.label} title={mark.label} className="hit relative block">
            {body}
          </Link>
        ) : (
          <span key={mark.id} role="img" aria-label={mark.label} title={mark.label} className="block">
            {body}
          </span>
        );
      })}
    </span>
  );
}

export function MarksLegend({ extra }: { extra?: ReactNode }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-secondary">
      <span className="inline-flex items-center gap-2">
        <Glyph state="found" /> {t("marks.found")}
      </span>
      <span className="inline-flex items-center gap-2">
        <Glyph state="missed" /> {t("marks.missed")}
      </span>
      <span className="inline-flex items-center gap-2">
        <Glyph state="false" /> {t("marks.false")}
      </span>
      {extra}
    </div>
  );
}
