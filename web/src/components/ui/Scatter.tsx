import { useState } from "react";
import { useT } from "../../lib/i18n";
import { rewardLabel } from "../../lib/format";

export interface Point {
  id: string;
  x: number; // inspection steps
  y: number; // reward
  kind: "oracle" | "replay";
  label: string;
  config: string;
}

// Reward against inspection steps, one point per run (after ARC Prize's cost/score plot).
// A click copies the config that reproduces the run (after PufferLib's Constellation).
export function Scatter({ points, height = 260 }: { points: Point[]; height?: number }) {
  const { t } = useT();
  const [copied, setCopied] = useState<string | null>(null);

  const maxX = Math.max(10, ...points.map((p) => p.x)) + 1;
  const minY = Math.min(...points.map((p) => p.y));
  const yLo = Math.max(-1, Math.floor((minY - 0.005) * 100) / 100);
  const yHi = 1;
  const yStep = Math.max(0.01, Math.ceil(((yHi - yLo) / 5) * 100) / 100);
  const yTicks: number[] = [];
  for (let v = yHi; v >= yLo - 1e-9; v = +(v - yStep).toFixed(4)) yTicks.push(+v.toFixed(2));
  const xTicks: number[] = [];
  for (let v = 0; v <= maxX; v += 2) xTicks.push(v);

  const left = (x: number) => `${(x / maxX) * 100}%`;
  const top = (y: number) => `${((yHi - y) / (yHi - yLo)) * 100}%`;

  async function copy(point: Point) {
    try {
      await navigator.clipboard.writeText(point.config);
      setCopied(point.id);
    } catch {
      setCopied(null);
    }
  }

  return (
    <figure className="m-0">
      <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-2">
        <div className="relative" style={{ height }}>
          {yTicks.map((v) => (
            <span key={v} className="num absolute right-0 -translate-y-1/2 text-[13px] text-ink-muted" style={{ top: top(v) }}>
              {v.toFixed(2)}
            </span>
          ))}
        </div>
        <div className="relative border-b border-l border-line-strong" style={{ height }}>
          {yTicks.map((v) => (
            <span key={v} className="absolute inset-x-0 border-t border-line" style={{ top: top(v) }} aria-hidden="true" />
          ))}
          {points.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => copy(p)}
              title={`${p.label}: ${rewardLabel(p.y)}, ${t("scatter.steps", { n: p.x })}`}
              aria-label={`${p.label}: ${rewardLabel(p.y)}, ${t("scatter.steps", { n: p.x })}. ${t("scatter.copy")}`}
              className="hit absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-[120ms] hover:scale-125"
              style={{ left: left(p.x), top: top(p.y) }}
            >
              {p.kind === "oracle" ? (
                <span className="block h-2.5 w-2.5 rounded-[1px] bg-ink" />
              ) : (
                <span className="block h-3 w-3 rounded-full border-2 border-ink bg-paper-raised" />
              )}
            </button>
          ))}
        </div>
        <span />
        <div className="relative h-6">
          {xTicks.map((v) => (
            <span key={v} className="num absolute -translate-x-1/2 text-[13px] text-ink-muted" style={{ left: left(v) }}>
              {v}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-secondary">
        <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-2">
            <span className="block h-2.5 w-2.5 rounded-[1px] bg-ink" /> {t("run.oracle")}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="block h-3 w-3 rounded-full border-2 border-ink" /> {t("run.guided")}
          </span>
          <span>{t("scatter.axes")}</span>
        </span>
        <span role="status" className="text-ink-muted">
          {copied ? t("scatter.copied") : t("scatter.hint")}
        </span>
      </figcaption>
    </figure>
  );
}
