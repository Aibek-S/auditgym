export function ProgressBar({
  value,
  max = 100,
  tone = "accent",
  label,
}: {
  value: number;
  max?: number;
  tone?: "accent" | "verified" | "finding";
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const colors = {
    accent: "bg-accent",
    verified: "bg-verified",
    finding: "bg-finding",
  };
  return (
    <div>
      {label ? (
        <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-ink-muted">
          <span>{label}</span>
          <span className="num">{Math.round(pct)}%</span>
        </div>
      ) : null}
      <div className="h-1.5 overflow-hidden rounded-full bg-paper-sunken">
        <div
          className={`animate-bar h-full rounded-full ${colors[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
