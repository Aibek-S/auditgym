import { ButtonLink } from "../components/ui/Button";

export function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <p className="font-mono text-[11px] text-ink-muted">404</p>
        <h1 className="mt-2 text-[24px] font-medium tracking-[-0.02em] text-ink">Episode not found</h1>
        <p className="mt-2 text-[12px] text-ink-secondary">
          The link points outside the loaded demo archive.
        </p>
        <ButtonLink to="/console" variant="secondary" className="mt-5">
          Back to console
        </ButtonLink>
      </div>
    </div>
  );
}
