import { useEffect, useState } from "react";

// The marker travels from 0 to the reward on arrival (and from the old value when the run
// changes). It moves with transform on a full-width layer, so the transition stays on the
// compositor and retargets mid-flight.
export const METER_TRAVEL_MS = 400;

export function RewardMeter({ reward }: { reward: number }) {
  const pct = Math.max(0, Math.min(100, ((reward + 1) / 2) * 100));
  const [shown, setShown] = useState(50);

  useEffect(() => {
    // Two frames: the first lets the starting position paint, so the browser has a value to
    // transition from; with one frame the change lands before first paint and simply jumps.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShown(pct));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [pct]);

  return (
    <div>
      <div
        className="relative h-2 rounded-full bg-paper-sunken"
        role="meter"
        aria-label="Reward"
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={reward}
      >
        <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
        <div
          className="absolute inset-0 transition-transform ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: `translateX(${shown}%)`, transitionDuration: `${METER_TRAVEL_MS}ms` }}
        >
          <div className="absolute top-1/2 left-0 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
        </div>
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-ink-muted">
        <span>-1</span>
        <span>0</span>
        <span>+1</span>
      </div>
    </div>
  );
}
