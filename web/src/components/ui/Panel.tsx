import type { ReactNode } from "react";

export function Panel({
  title,
  meta,
  children,
  className = "",
  bodyClassName = "",
  id,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-card border border-line bg-paper-raised ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-medium text-ink">{title}</h2>
          {meta ? <div className="text-[13px] text-ink-muted">{meta}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName || "p-5"}>{children}</div>
    </section>
  );
}

/** A label, dot leaders, an optional line code, the value. */
export function Leader({ label, value, code, className = "" }: { label: ReactNode; value: ReactNode; code?: string; className?: string }) {
  return (
    <div className={`leader ${className}`}>
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="m-0 flex items-baseline gap-2 text-right text-ink">
        {code ? <span className="num text-[13px] text-ink-muted">{code}</span> : null}
        <span className="num">{value}</span>
      </dd>
    </div>
  );
}
