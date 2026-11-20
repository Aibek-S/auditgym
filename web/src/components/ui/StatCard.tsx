import type { CSSProperties, ReactNode } from "react";

export function StatCard({
  label,
  value,
  meta,
  mono = true,
  className = "",
  style,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  mono?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`rounded-card border border-line bg-paper-raised px-4 py-3.5 ${className}`} style={style}>
      <div className="text-[11px] font-medium text-ink-muted">{label}</div>
      <div className={`mt-1.5 text-[26px] leading-none font-medium tracking-[-0.02em] text-ink ${mono ? "num" : ""}`}>
        {value}
      </div>
      {meta ? <div className="mt-2 text-[11px] leading-snug text-ink-muted">{meta}</div> : null}
    </div>
  );
}
