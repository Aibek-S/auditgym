// The mark is a stamp: the name in capitals inside a ruled, slightly turned frame (brief: "stamp" mark;
// capitals only on stamps). In running text the name is written "auditgym".
export function BrandMark({ to = "/" }: { to?: string }) {
  return (
    <a href={to} className="hit relative inline-flex shrink-0 items-center no-underline" aria-label="auditgym">
      <span className="inline-block -rotate-3 rounded-[2px] border-2 border-ink px-2 py-0.5 text-[13px] font-semibold tracking-[0.08em] text-ink uppercase">
        auditgym
      </span>
    </a>
  );
}
