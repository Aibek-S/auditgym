import type { IssueType } from "../../lib/types";
import { useT } from "../../lib/i18n";
import { typeLabel } from "../../lib/labels";

// Each error type keeps one small shape so the four read apart without relying on colour.
const shapes: Record<IssueType, string> = {
  duplicate_invoice: "rounded-[1px]",
  payment_allocation: "rounded-full",
  fx_conversion: "rotate-45 rounded-[1px]",
  period_cutoff: "rounded-[1px] [clip-path:polygon(50%_0,100%_100%,0_100%)]",
};

export function TypeMark({ type, className = "" }: { type: IssueType; className?: string }) {
  return <span className={`inline-block h-2 w-2 shrink-0 bg-ink-secondary ${shapes[type]} ${className}`} aria-hidden="true" />;
}

export function TypeBadge({ type, count }: { type: IssueType; count?: number }) {
  const { t } = useT();
  return (
    <span className="inline-flex items-center gap-2 text-[14px] text-ink-secondary">
      <TypeMark type={type} />
      <span>{typeLabel(t, type)}</span>
      {count !== undefined ? <span className="num text-ink-muted">{count}</span> : null}
    </span>
  );
}
