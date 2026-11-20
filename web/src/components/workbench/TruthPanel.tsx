import { Lock, ArrowRight } from "lucide-react";
import type { Episode, TruthIssue } from "../../lib/types";
import { money, TYPE_NOTES } from "../../lib/format";
import { type RecordRef } from "../../lib/records";
import { Panel } from "../ui/Panel";
import { Stamp } from "../ui/Stamp";
import { TypeBadge } from "../ui/TypeBadge";
import { Button } from "../ui/Button";
import { RawChip } from "./RawChip";

export function TruthPanel({
  episode,
  truthOn,
  onTruthChange,
  onOpenRef,
  onOpenRun,
}: {
  episode: Episode;
  truthOn: boolean;
  onTruthChange: (value: boolean) => void;
  onOpenRef: (ref: RecordRef) => void;
  onOpenRun: () => void;
}) {
  return (
    <Panel
      title="Evaluator truth"
      meta={truthOn ? `${episode.truth.issues.length} recorded` : "sealed"}
      bodyClassName="p-4"
    >
      {truthOn ? (
        <div className="animate-fade space-y-4">
          {episode.truth.issues.length === 0 ? (
            <div>
              <Stamp tone="verified" animate delay={160}>
                Clean
              </Stamp>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
                No injected issue in this month. The correct submission is an empty list; a false
                finding on a clean month scores −1.000.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px] leading-relaxed text-ink-secondary">
                The truth lens marks affected rows red and evidence rows blue. The agent never sees
                this panel.
              </p>
              <div className="space-y-3">
                {episode.truth.issues.map((issue) => (
                  <IssueCard
                    key={issue.issue_id}
                    episode={episode}
                    issue={issue}
                    onOpenRef={onOpenRef}
                  />
                ))}
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => onTruthChange(false)}
              className="text-[11px] text-ink-muted transition-colors hover:text-ink"
            >
              Hide truth
            </button>
            <button
              type="button"
              onClick={onOpenRun}
              className="relative hit inline-flex items-center gap-1 text-[11px] font-medium text-accent transition-colors hover:text-accent-ink"
            >
              Open guided review
              <ArrowRight size={12} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control border border-line bg-paper text-ink-muted">
              <Lock size={14} strokeWidth={1.5} />
            </span>
            <div>
              <p className="text-[12px] font-medium text-ink">Hidden from the agent</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">
                Issue ids, amounts and evidence sets live outside the episode folder. Reveal them
                to inspect this month the way the matcher will.
              </p>
            </div>
          </div>
          <Button variant="primary" size="sm" className="mt-4 w-full" onClick={() => onTruthChange(true)}>
            Reveal truth
          </Button>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            Demo console: this panel is not part of the agent interface.
          </p>
        </div>
      )}
    </Panel>
  );
}

function IssueCard({
  episode,
  issue,
  onOpenRef,
}: {
  episode: Episode;
  issue: TruthIssue;
  onOpenRef: (ref: RecordRef) => void;
}) {
  const change = episode.truth.provenance.changes.find((item) => item.issue_id === issue.issue_id);
  const after = change?.after ?? {};

  return (
    <article className="rounded-control border border-line bg-paper p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[11px] text-ink-muted">{issue.issue_id}</span>
          <TypeBadge type={issue.type} />
        </div>
      </div>
      <p className="num mt-2 text-[13px] text-ink">
        {money(issue.expected_amount_minor)}{" "}
        <span className="text-[11px] text-ink-muted">{issue.currency}</span>
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">{TYPE_NOTES[issue.type]}</p>

      <p className="mt-3 text-[11px] font-medium text-ink-muted">
        Affected
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {issue.affected_ids.map((id) => (
          <RawChip key={id} episode={episode} rawId={id} tone="finding" onOpenRef={onOpenRef} />
        ))}
      </div>

      <p className="mt-3 text-[11px] font-medium text-ink-muted">
        Evidence sets
      </p>
      <div className="mt-1.5 space-y-1.5">
        {issue.evidence_sets.map((set, index) => (
          <div key={index} className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-ink-muted">{index + 1}.</span>
            {set.map((id) => (
              <RawChip key={id} episode={episode} rawId={id} onOpenRef={onOpenRef} />
            ))}
          </div>
        ))}
      </div>

      {change ? (
        <div className="mt-3 rounded-control border-l-2 border-accent bg-paper-sunken/70 px-2.5 py-2">
          <p className="text-[11px] leading-relaxed text-ink-secondary">{change.decision}</p>
          {Object.entries(after).length ? (
            <dl className="mt-1.5 space-y-0.5">
              {Object.entries(after).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3 font-mono text-[11px]">
                  <dt className="text-ink-muted">{labelize(key)}</dt>
                  <dd className="num truncate text-ink">{formatValue(key, value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function labelize(key: string): string {
  return key.replace(/_/g, " ");
}

function formatValue(key: string, value: unknown): string {
  if (typeof value === "number" && key.endsWith("_minor")) return money(value);
  return String(value);
}
