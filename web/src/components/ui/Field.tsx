import type { ReactNode } from "react";

export function Field({
  label,
  children,
  mono = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-medium text-ink-muted">{label}</dt>
      <dd className={`mt-1 text-[12px] leading-snug text-ink ${mono ? "font-mono text-[11px]" : ""}`}>
        {children}
      </dd>
    </div>
  );
}
