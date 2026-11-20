import type { IssueType } from "../../lib/types";
import { TYPE_LABELS } from "../../lib/format";

const dots: Record<IssueType, string> = {
  duplicate_invoice: "bg-finding",
  payment_allocation: "bg-warning",
  fx_conversion: "bg-accent",
  period_cutoff: "bg-ink-secondary",
};

export function TypeBadge({ type, count }: { type: IssueType; count?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-ink-secondary">
      <span className={`h-1.5 w-1.5 rounded-[1px] ${dots[type]}`} aria-hidden="true" />
      <span>{TYPE_LABELS[type]}</span>
      {count !== undefined ? <span className="num text-ink-muted">{count}</span> : null}
    </span>
  );
}
