import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Gauge, LayoutDashboard, Menu, Table2, X } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { useDemo } from "../lib/data";

const nav = [
  { to: "/console", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/console/episodes", label: "Episodes", icon: Table2, end: false },
  { to: "/baselines", label: "Baselines", icon: Gauge, end: true },
  { to: "/method", label: "Method", icon: BookOpen, end: true },
];

function Breadcrumbs() {
  const data = useDemo();
  const location = useLocation();
  const parts = location.pathname.split("/").filter(Boolean);
  const episode = parts[0] === "console" && parts[1] === "episodes"
    ? data.episodes.find((item) => item.key === parts[2])
    : undefined;
  const run = episode && parts[3] === "runs"
    ? episode.runs.find((item) => item.id === parts[4])
    : undefined;

  const crumbs: { label: string; to?: string }[] = [];
  if (location.pathname === "/baselines") crumbs.push({ label: "Baselines" });
  else if (location.pathname === "/method") crumbs.push({ label: "Method" });
  else if (location.pathname === "/console/episodes") crumbs.push({ label: "Episodes" });
  else if (episode) {
    crumbs.push({ label: "Episodes", to: "/console/episodes" });
    crumbs.push({ label: episode.label, to: `/console/episodes/${episode.key}` });
    if (run) crumbs.push({ label: run.label });
  } else crumbs.push({ label: "Overview" });

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[12px]">
      {crumbs.map((crumb, index) => (
        <span
          key={`${crumb.label}-${index}`}
          className={`min-w-0 items-center gap-2 ${
            index === crumbs.length - 1 ? "flex" : "hidden sm:flex"
          }`}
        >
          {index > 0 ? <span className="hidden text-ink-muted sm:inline">/</span> : null}
          {crumb.to ? (
            <Link to={crumb.to} className="truncate text-ink-muted no-underline transition-colors hover:text-ink">
              {crumb.label}
            </Link>
          ) : (
            <span className="truncate text-ink">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function AppShell() {
  const data = useDemo();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const episodeMatch = location.pathname.match(/^\/console\/episodes\/([^/]+)/);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="min-h-screen bg-paper">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-paper-sunken transition-[transform,visibility] lg:visible lg:translate-x-0 ${
          navOpen
            ? "visible translate-x-0 duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
            : "invisible -translate-x-full duration-150 ease-[cubic-bezier(0.7,0,0.84,0)]"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <BrandMark />
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-control text-ink-muted hover:bg-ink/5 hover:text-ink lg:hidden"
            aria-label="Close navigation"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4" aria-label="Main">
          <p className="mb-2 px-2 text-[11px] font-medium text-ink-muted">Console</p>
          <div className="space-y-0.5">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex h-9 items-center gap-2.5 rounded-control px-2 text-[13px] no-underline transition-colors ${
                      isActive
                        ? "bg-paper-raised text-ink shadow-[inset_0_0_0_1px_var(--color-line)]"
                        : "text-ink-secondary hover:bg-ink/5 hover:text-ink"
                    }`
                  }
                >
                  <Icon size={16} strokeWidth={1.5} className="shrink-0 text-ink-muted" />
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-line p-4">
          <p className="text-[11px] font-medium text-ink-secondary">FinTech case</p>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
            RL environments for fine-tuning financial audit models
          </p>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-verified" aria-hidden="true" />
            {data.stats.episodes} episodes loaded
          </div>
        </div>
      </aside>

      <button
        type="button"
        tabIndex={-1}
        className={`fixed inset-0 z-30 bg-ink/25 transition-opacity lg:hidden ${
          navOpen ? "opacity-100 duration-[260ms]" : "pointer-events-none opacity-0 duration-150"
        }`}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-paper/92 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-ink/5 hover:text-ink lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={18} strokeWidth={1.5} />
            </button>
            <Breadcrumbs />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <label className="sr-only" htmlFor="episode-jump">
              Jump to episode
            </label>
            <select
              id="episode-jump"
              value={episodeMatch?.[1] ?? ""}
              onChange={(event) => {
                if (event.target.value) navigate(`/console/episodes/${event.target.value}`);
              }}
              className="h-8 max-w-[170px] rounded-control border border-line bg-paper-raised px-2 text-[12px] text-ink-secondary outline-none transition-colors hover:border-line-strong focus:border-accent sm:max-w-[190px]"
            >
              <option value="">Jump to episode</option>
              {data.episodes.map((episode) => (
                <option key={episode.key} value={episode.key}>
                  {episode.label}
                </option>
              ))}
            </select>
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-paper-raised px-2.5 py-1 text-[11px] text-ink-muted sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-verified" aria-hidden="true" />
              Demo data
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
