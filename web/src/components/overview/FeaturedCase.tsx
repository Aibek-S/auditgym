import type { Episode } from "../../lib/types";
import { dateShort, money, rewardLabel } from "../../lib/format";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Stamp } from "../ui/Stamp";

export function FeaturedCase({ episode }: { episode: Episode }) {
  const issue = episode.truth.issues[0];
  if (!issue) return null;
  const change = episode.truth.provenance.changes.find((item) => item.issue_id === issue.issue_id);
  const after = (change?.after ?? {}) as Record<string, string>;
  const amount = issue.expected_amount_minor;

  return (
    <section className="overflow-hidden rounded-card border border-line bg-paper-raised">
      <div className="grid lg:grid-cols-[1.1fr_1fr]">
        <div className="border-b border-line p-5 lg:border-r lg:border-b-0 lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] text-ink-muted">
              Featured episode
            </p>
            <Stamp tone="finding" animate delay={300}>
              Finding
            </Stamp>
          </div>
          <h2 className="mt-4 max-w-md text-[24px] leading-[1.2] font-medium tracking-[-0.02em] text-ink">
            Two invoices for one delivery
          </h2>
          <p className="mt-2 max-w-lg text-[12px] leading-relaxed text-ink-secondary">
            NorthAngels re-entered an already invoiced delivery. The delivery note is shared, both
            lines reach revenue, and no credit note reverses the original.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="rounded-control border border-line bg-paper px-2 py-1 font-mono text-[11px] text-ink">
              {after.duplicates ?? issue.affected_ids[0]}
            </span>
            <ArrowRight size={12} strokeWidth={1.5} className="text-ink-muted" />
            <span className="rounded-control border border-line bg-paper px-2 py-1 font-mono text-[11px] text-ink">
              {issue.affected_ids[issue.affected_ids.length - 1]}
            </span>
            <ArrowRight size={12} strokeWidth={1.5} className="text-ink-muted" />
            <span className="rounded-control border border-line bg-paper px-2 py-1 font-mono text-[11px] text-ink">
              {after.delivery_note_id ?? "delivery note"}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <p className="text-[11px] text-ink-muted">Exposed amount</p>
              <p className="num mt-0.5 text-[18px] font-medium text-ink">
                {money(amount)} <span className="text-[11px] text-ink-muted">KZT</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink-muted">Period</p>
              <p className="mt-0.5 text-[12px] text-ink">{dateShort(episode.manifest.period_start)}</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-muted">Guided reward</p>
              <p className="num mt-0.5 text-[18px] font-medium text-ink">
                {rewardLabel(episode.summary.guided_score.reward)}
              </p>
            </div>
          </div>

          <Link
            to={`/console/episodes/${episode.key}`}
            className="mt-6 relative hit inline-flex items-center gap-1.5 text-[12px] font-medium text-accent no-underline transition-colors hover:text-accent-ink"
          >
            Open the evidence
            <ArrowRight size={13} strokeWidth={1.5} />
          </Link>
        </div>

        <div className="relative flex items-center justify-center bg-paper-sunken/60 p-5 lg:p-6">
          <div className="w-full max-w-sm">
            <div className="mb-2 flex items-center justify-between font-mono text-[11px] text-ink-muted">
              <span>delivery</span>
              <span>{after.delivery_note_id ?? "DN"}</span>
            </div>
            <div className="relative h-px w-full bg-line-strong">
              <span className="animate-draw absolute inset-y-0 left-0 w-2/3 bg-accent" />
              <span className="absolute top-1/2 left-[33%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper bg-finding" />
              <span className="absolute top-1/2 left-[66%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper bg-finding" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {issue.affected_ids.map((id) => (
                <div key={id} className="rounded-control border border-line bg-paper-raised p-2.5">
                  <p className="font-mono text-[11px] text-ink">{id}</p>
                  <p className="num mt-1 text-[11px] text-ink-secondary">{money(amount)} KZT</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">Revenue posted</p>
                </div>
              ))}
            </div>
            <div className="mt-2 rounded-control border border-dashed border-line-strong p-2.5">
              <p className="font-mono text-[11px] text-ink-secondary">
                {issue.evidence_sets[0]?.filter((id) => id.startsWith("L-")).join(" · ") ?? "ledger rows"}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-muted">AR debit / revenue credit, same delivery</p>
            </div>
            <p className="mt-3 text-center font-mono text-[11px] text-ink-muted">
              no reversing credit note · same delivery note · both in revenue
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
