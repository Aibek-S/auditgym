import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

// Tabs drawn as chips (brief: "top bar with tabs, as chips"). Active chip is ink-filled.
const chip =
  "hit relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border px-3 text-[13px] font-medium no-underline transition-[color,background-color,border-color] duration-[120ms]";
const on = "border-ink bg-ink text-on-ink";
const off = "border-line-strong bg-transparent text-ink-secondary hover:border-ink hover:text-ink";

export function ChipLink({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `${chip} ${isActive ? on : off}`}>
      {children}
    </NavLink>
  );
}

export function ChipButton({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <button type="button" aria-pressed={active} aria-label={label} onClick={onClick} className={`${chip} ${active ? on : off}`}>
      {children}
    </button>
  );
}
