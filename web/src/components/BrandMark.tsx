import { Link } from "react-router-dom";

export function BrandMark({ to = "/console", subtitle = "console" }: { to?: string; subtitle?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5 no-underline">
      <span className="grid h-7 w-7 place-items-center rounded-[6px] border border-ink/25 bg-paper-raised font-mono text-[11px] font-medium leading-none text-ink">
        AG
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[15px] font-semibold tracking-[-0.015em] text-ink">AuditGym</span>
        <span className="hidden font-mono text-[11px] text-ink-muted min-[400px]:inline">{subtitle}</span>
      </span>
    </Link>
  );
}
