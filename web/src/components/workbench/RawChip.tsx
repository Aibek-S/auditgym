import type { Episode } from "../../lib/types";
import { refFromRawId, type RecordRef } from "../../lib/records";

export function RawChip({
  episode,
  rawId,
  tone = "neutral",
  onOpenRef,
}: {
  episode: Episode;
  rawId: string;
  tone?: "neutral" | "finding";
  onOpenRef: (ref: RecordRef) => void;
}) {
  const ref = refFromRawId(episode, rawId);
  const classes =
    tone === "finding"
      ? "border-finding/30 bg-finding-soft text-finding hover:border-finding"
      : "border-line bg-paper-raised text-ink-secondary hover:border-accent hover:text-accent";
  if (!ref) {
    return (
      <span className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${classes}`}>{rawId}</span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpenRef(ref)}
      className={`rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors pointer-coarse:px-2.5 pointer-coarse:py-2 ${classes}`}
    >
      {rawId}
    </button>
  );
}
