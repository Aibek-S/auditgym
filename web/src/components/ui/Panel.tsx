import type { ReactNode } from "react";

export function Panel({
  title,
  meta,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-card border border-line bg-paper-raised ${className}`}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[12px] font-medium text-ink">{title}</h2>
          {meta ? <div className="text-[11px] text-ink-muted">{meta}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName || "p-4"}>{children}</div>
    </section>
  );
}
