import { useParams } from "react-router-dom";
import {
  ArrowRight,
  FileSearch,
  FileText,
  List,
  Send,
  Terminal,
} from "lucide-react";
import { findEpisode, useDemo } from "../lib/data";
import { dateShort, money, rewardLabel, TYPE_NOTES } from "../lib/format";
import type { Run, RunStep } from "../lib/types";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { Stamp } from "../components/ui/Stamp";
import { TypeBadge } from "../components/ui/TypeBadge";
import { RewardMeter } from "../components/ui/RewardMeter";
import { ButtonLink } from "../components/ui/Button";
import { NotFound } from "./NotFound";

const stepIcons = {
  list: List,
  record: FileSearch,
  document: FileText,
  submit: Send,
};

export function RunPage() {
  const data = useDemo();
  const { episodeKey, runId } = useParams();
  const episode = findEpisode(data, episodeKey);
  const run = episode?.runs.find((item) => item.id === runId);
  if (!episode || !run) return <NotFound />;

  const otherRun = episode.runs.find((item) => item.id !== run.id);
  const score = run.score;
  const penalty = 0.002 * score.inspection_steps;
  const base = 2 * score.f1 - 1;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${episode.label} · ${run.kind === "oracle" ? "oracle" : "demo replay"}`}
        title={run.label}
        description={run.note}
        actions={
          <>
            <ButtonLink to={`/console/episodes/${episode.key}`} variant="secondary">
              Episode workbench
            </ButtonLink>
            {otherRun ? (
              <ButtonLink
                to={`/console/episodes/${episode.key}/runs/${otherRun.id}`}
                variant="primary"
              >
                {otherRun.kind === "oracle" ? "View oracle" : "View guided replay"}
                <ArrowRight size={14} strokeWidth={1.5} />
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        <Panel
          title="Trace"
          className="min-w-0 self-start"
          meta={
            run.steps.length
              ? `${run.steps.length} actions · ${score.inspection_steps} inspection steps`
              : "no tool calls"
          }
          bodyClassName="p-4"
        >
          {run.steps.length ? (
            <ol className="relative ml-6 space-y-3 border-l border-line">
              {run.steps.map((step) => (
                <StepCard key={step.step} step={step} episodeAccounts={episode.accounts} />
              ))}
            </ol>
          ) : (
            <TraceEmpty run={run} />
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="Score" meta={run.kind === "oracle" ? "oracle" : "evaluator"}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] text-ink-muted">Reward</p>
                <p className="num mt-1 text-[38px] leading-none font-medium tracking-[-0.03em] text-ink">
                  {rewardLabel(score.reward)}
                </p>
              </div>
              <VerdictStamp run={run} />
            </div>

            <div className="mt-4">
              <RewardMeter reward={score.reward} />
            </div>

            <div className="mt-4 grid grid-cols-3 divide-x divide-line overflow-hidden rounded-control border border-line">
              <Metric label="P" value={score.precision.toFixed(3)} />
              <Metric label="R" value={score.recall.toFixed(3)} />
              <Metric label="F1" value={score.f1.toFixed(3)} />
            </div>

            <dl className="mt-4 space-y-2 text-[11px]">
              <ScoreRow label="True positives" value={score.tp} />
              <ScoreRow label="False positives" value={score.fp} tone={score.fp ? "finding" : undefined} />
              <ScoreRow label="False negatives" value={score.fn} tone={score.fn ? "finding" : undefined} />
              <ScoreRow label="Inspection steps" value={score.inspection_steps} />
              <ScoreRow label="Step penalty" value={penalty ? `−${penalty.toFixed(3)}` : "0.000"} />
            </dl>

            <div className="mt-4 rounded-control bg-paper-sunken px-3 py-2.5">
              <p className="font-mono text-[11px] leading-relaxed text-ink">
                2 × {score.f1.toFixed(3)} − 1 − 0.002 × {score.inspection_steps}
              </p>
              <p className="mt-1 font-mono text-[11px] text-ink">
                = {rewardLabel(base)} − {penalty.toFixed(3)} = {rewardLabel(score.reward)}
              </p>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
              Submit is free. Each inspection step costs 0.002; the reward is clipped to [−1, 1].
            </p>
          </Panel>

          <Panel title="Submitted findings" meta={`${run.findings.length}`}>
            {run.findings.length === 0 ? (
              <div>
                <Stamp tone="verified" animate>
                  Verified
                </Stamp>
                <p className="mt-3 text-[11px] leading-relaxed text-ink-secondary">
                  Empty submission. The recorded truth for this month is also empty, so precision,
                  recall and F1 are 1.000.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {run.findings.map((finding, index) => (
                  <article
                    key={`${finding.type}-${index}`}
                    className="rounded-control border border-line bg-paper p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <TypeBadge type={finding.type} />
                      <span className="num text-[11px] text-ink">
                        {money(finding.claimed_amount_minor)}{" "}
                        <span className="text-[11px] text-ink-muted">{finding.currency}</span>
                      </span>
                    </div>
                    <p className="mt-2 font-mono text-[11px] text-ink-secondary">
                      {finding.affected_ids.join(" · ")}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                      {finding.explanation ?? TYPE_NOTES[finding.type]}
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-ink-muted">
                      evidence {finding.evidence_ids.join(" · ")}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Provenance">
            <p className="text-[11px] leading-relaxed text-ink-secondary">
              {run.kind === "oracle"
                ? "The oracle reads truth.json directly. It has no public-file trace and no inspection cost, so this run proves the episode is solvable rather than how it was solved."
                : "This replay opens the same public records shown in the workbench. It is not a policy run from the Python environment; it is a recorded demonstration of the evidence path."}
            </p>
            <ButtonLink
              to={`/console/episodes/${episode.key}`}
              variant="secondary"
              size="sm"
              className="mt-3"
            >
              Inspect the episode
              <ArrowRight size={12} strokeWidth={1.5} />
            </ButtonLink>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function VerdictStamp({ run }: { run: Run }) {
  if (run.kind === "oracle") return <Stamp tone="verified">Oracle</Stamp>;
  if (run.score.fp > 0) return <Stamp tone="finding">False positive</Stamp>;
  if (run.score.fn > 0) return <Stamp tone="finding">Missed</Stamp>;
  if (run.findings.length > 0) return <Stamp tone="verified" animate>Matched</Stamp>;
  return (
    <Stamp tone="verified" animate>
      Clean
    </Stamp>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper px-2 py-2 text-center">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className="num mt-0.5 text-[12px] text-ink">{value}</p>
    </div>
  );
}

function ScoreRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "finding";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`num ${tone === "finding" ? "text-finding" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function StepCard({
  step,
  episodeAccounts,
}: {
  step: RunStep;
  episodeAccounts: Record<string, string>;
}) {
  const Icon = stepIcons[step.kind] ?? Terminal;
  return (
    <li className="relative">
      <span className="absolute top-2.5 -left-9 grid h-6 w-6 place-items-center rounded-full border border-line bg-paper-raised font-mono text-[11px] text-ink-secondary">
        {step.step}
      </span>
      <div className="rounded-control border border-line bg-paper-raised px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon size={13} strokeWidth={1.5} className="shrink-0 text-ink-muted" />
            <p className="truncate text-[12px] font-medium text-ink">{step.label}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {step.reward ? (
              <span className="num rounded border border-verified/30 bg-verified-soft px-1.5 py-0.5 text-[11px] text-verified">
                +{rewardLabel(step.reward)}
              </span>
            ) : null}
            <span className="font-mono text-[11px] text-ink-muted">{step.kind}</span>
          </div>
        </div>
        <p className="mt-1 truncate font-mono text-[11px] text-ink-muted">
          {actionSummary(step)}
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-secondary">
          {resultSummary(step, episodeAccounts)}
        </p>
        {step.terminated ? (
          <p className="mt-1.5 text-[11px] text-ink-muted">
            Episode terminated. Reward returned. Steps remaining:{" "}
            <span className="num">{step.observation.steps_remaining}</span>.
          </p>
        ) : null}
        <details className="group mt-2">
          <summary className="cursor-pointer text-[11px] text-ink-muted transition-colors hover:text-ink">
            Observation
          </summary>
          <pre className="mt-1.5 max-h-56 overflow-auto rounded bg-paper-sunken p-2 font-mono text-[11px] leading-relaxed text-ink-secondary">
            {JSON.stringify(step.observation.result, null, 2)}
          </pre>
        </details>
      </div>
    </li>
  );
}

function actionSummary(step: RunStep): string {
  const action = step.action;
  if (action.action === "list_records") {
    return `list_records · ${String(action.table)} · limit ${String(action.limit ?? 50)}`;
  }
  if (action.action === "get_record") {
    return `get_record · ${String(action.table)} · ${String(action.id)}`;
  }
  if (action.action === "get_document") {
    return `get_document · ${String(action.doc_id)}`;
  }
  if (action.action === "submit") {
    const findings = Array.isArray(action.findings) ? action.findings.length : 0;
    return `submit · ${findings} finding${findings === 1 ? "" : "s"}`;
  }
  return action.action;
}

function resultSummary(step: RunStep, accounts: Record<string, string>): string {
  const result = step.observation.result as Record<string, unknown> | null;
  if (!result) return "No result.";
  if (!step.observation.ok) {
    return step.observation.error?.message ?? "Action failed.";
  }
  if (Array.isArray(result.rows)) {
    const cursor = result.next_cursor;
    return `${result.rows.length} row${result.rows.length === 1 ? "" : "s"} returned${
      cursor ? ` · next cursor ${String(cursor)}` : ""
    }.`;
  }
  if (typeof result.row_id === "string") {
    const account = typeof result.account === "string" ? accounts[result.account] : "";
    const amount =
      typeof result.debit_minor === "number" && result.debit_minor
        ? `Dr ${money(result.debit_minor)}`
        : typeof result.credit_minor === "number" && result.credit_minor
          ? `Cr ${money(result.credit_minor)}`
          : "no amount";
    return `${result.row_id} · ${account ?? String(result.account ?? "")} · ${amount}.`;
  }
  if (typeof result.invoice_id === "string") {
    const total = typeof result.total_minor === "number" ? money(result.total_minor) : "";
    const currency = typeof result.currency === "string" ? result.currency : "";
    const lines = Array.isArray(result.line_items)
      ? ` · ${result.line_items.length} line items`
      : "";
    return `Invoice ${result.invoice_id} · ${total} ${currency}${lines}.`;
  }
  if (typeof result.payment_id === "string") {
    const total = typeof result.amount_minor === "number" ? money(result.amount_minor) : "";
    return `Payment ${result.payment_id} · ${total} ${String(result.currency ?? "")}.`;
  }
  if (typeof result.date === "string" && typeof result.rate === "string") {
    return `FX ${dateShort(result.date)} · ${String(result.source_currency)}/${String(
      result.target_currency,
    )} · ${result.rate}.`;
  }
  if (typeof result.submitted === "number") {
    return `${result.submitted} finding${result.submitted === 1 ? "" : "s"} submitted.`;
  }
  return "Record returned.";
}

function TraceEmpty({ run }: { run: Run }) {
  return (
    <div className="grid min-h-[340px] place-items-center rounded-control border border-dashed border-line-strong bg-paper-sunken/40 px-6 py-10 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-line bg-paper-raised text-ink-muted">
          <Terminal size={16} strokeWidth={1.5} />
        </span>
        <p className="mt-3 text-[13px] font-medium text-ink">No tool calls</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-secondary">
          {run.kind === "oracle"
            ? "The oracle reads private truth and submits it directly. Zero inspection steps means the reward is 1.000 by construction."
            : "This run has no recorded actions."}
        </p>
        <p className="mt-3 font-mono text-[11px] text-ink-muted">
          {run.kind === "oracle" ? "truth.json → submit" : "empty trace"}
        </p>
      </div>
    </div>
  );
}
