import type { IssueTypeSummary } from "../../lib/types";
import { TYPE_NOTES } from "../../lib/format";
import { TypeBadge } from "../ui/TypeBadge";

// A share of all findings: one neutral ramp for the bars, the type dot carries the category colour.
export function ErrorMix({ types }: { types: IssueTypeSummary[] }) {
  const total = Math.max(1, types.reduce((sum, item) => sum + item.count, 0));
  return (
    <div className="space-y-3">
      {types.map((item, index) => (
        <div key={item.type} title={TYPE_NOTES[item.type]}>
          <div className="flex items-baseline justify-between gap-3">
            <TypeBadge type={item.type} />
            <span className="num text-[11px] text-ink-muted">
              {item.count} of {total}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-paper-sunken">
            <div
              className="animate-bar h-full rounded-full bg-ink/45"
              style={{
                width: `${(item.count / total) * 100}%`,
                animationDelay: `${index * 40}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
