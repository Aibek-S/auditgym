import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <p className="font-mono text-[11px] text-ink-muted">404</p>
        <h1 className="mt-2 text-[24px] font-medium tracking-[-0.02em] text-ink">Episode not found</h1>
        <p className="mt-2 text-[12px] text-ink-secondary">
          The link points outside the loaded demo archive.
        </p>
        <Link
          to="/console"
          className="mt-5 inline-flex h-9 items-center rounded-control border border-line-strong bg-paper-raised px-4 text-[12px] font-medium text-ink no-underline hover:bg-paper-sunken"
        >
          Back to console
        </Link>
      </div>
    </div>
  );
}
