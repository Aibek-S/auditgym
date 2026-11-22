import { useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n";
import { Term } from "../ui/Term";

/** The step budget: a bar that shortens one step at a time, and a "−1" that rises once per step. */
export function Budget({ used, max = 100 }: { used: number; max?: number }) {
  const { t } = useT();
  const last = useRef(used);
  const [spent, setSpent] = useState<{ n: number; key: number } | null>(null);

  useEffect(() => {
    const delta = used - last.current;
    last.current = used;
    if (delta > 0) setSpent({ n: delta, key: Date.now() });
  }, [used]);

  const left = Math.max(0, max - used);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] text-ink">
          <Term k="step">
            <span className="num font-medium">{t("practice.budget", { used })}</span>
          </Term>
        </p>
        <span className="relative num text-[14px] text-ink-muted" aria-hidden="true">
          {spent ? (
            <span key={spent.key} className="budget-spend absolute -top-1 right-0 font-medium text-finding">
              −{spent.n}
            </span>
          ) : null}
        </span>
      </div>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-paper-sunken"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={left}
        aria-label={t("practice.budget", { used })}
      >
        <div className={`budget-bar h-full rounded-full ${left <= 20 ? "bg-finding" : "bg-ink"}`} style={{ transform: `scaleX(${left / max})` }} />
      </div>
      <p className="mt-1.5 text-[13px] text-ink-muted">{t("practice.budget.hint")}</p>
    </div>
  );
}
