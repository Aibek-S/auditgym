export function RewardMeter({ reward }: { reward: number }) {
  const pct = Math.max(0, Math.min(100, ((reward + 1) / 2) * 100));
  return (
    <div>
      <div className="relative h-2 rounded-full bg-paper-sunken">
        <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
        <div
          className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-ink-muted">
        <span>-1</span>
        <span>0</span>
        <span>+1</span>
      </div>
    </div>
  );
}
