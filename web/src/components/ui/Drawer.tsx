import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// Open eases out over 260ms; close eases in at roughly half that, so dismissing never waits.
const OPEN = "duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)]";
const CLOSE = "duration-150 ease-[cubic-bezier(0.7,0,0.84,0)]";

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} inert={!open}>
      <div
        className={`absolute inset-0 bg-ink/25 transition-opacity ${open ? `opacity-100 ${OPEN}` : `opacity-0 ${CLOSE}`}`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute top-0 right-0 flex h-full w-full max-w-[520px] flex-col border-l border-line bg-paper-raised shadow-[-16px_0_48px_rgba(29,35,41,0.10)] transition-transform ${
          open ? `translate-x-0 ${OPEN}` : `translate-x-full ${CLOSE}`
        }`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-medium text-ink">{title}</h2>
            {subtitle ? <div className="mt-1 text-[11px] text-ink-muted">{subtitle}</div> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="hit relative grid h-8 w-8 shrink-0 place-items-center rounded-control text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
            aria-label="Close panel"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <footer className="border-t border-line px-5 py-3">{footer}</footer> : null}
      </aside>
    </div>
  );
}
