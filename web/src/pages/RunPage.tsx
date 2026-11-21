import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { findEpisode, useDemo } from "../lib/data";
import { useT, type T } from "../lib/i18n";
import { date, money, ratio, rewardLabel, signed } from "../lib/format";
import { accountName, episodeLabel, runConfig, runLabel, runNote, typeLabel } from "../lib/labels";
import { runMarks } from "../lib/runs";
import type { Episode, Run, RunStep } from "../lib/types";
import { Button, ButtonLink } from "../components/ui/Button";
import { Leader, Panel } from "../components/ui/Panel";
import { Stamp } from "../components/ui/Stamp";
import { Marks, MarksLegend } from "../components/ui/Isotype";
import { NotFound } from "./NotFound";

export function RunPage() {
  const data = useDemo();
  const { t, n } = useT();
  const { episodeKey, runId } = useParams();
  const episode = findEpisode(data, episodeKey);
  const run = episode?.runs.find((item) => item.id === runId);
  const [current, setCurrent] = useState(1);
  const [copied, setCopied] = useState(false);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  // The sticky panel follows the step nearest the middle of the screen (after AI 2027's side panel).
  useEffect(() => {
    const body = tableRef.current;
    if (!body) return;
    const rows = Array.from(body.querySelectorAll<HTMLTableRowElement>("tr[data-step]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    rows.forEach((row) => io.observe(row));
    return () => io.disconnect();
  }, [runId, episodeKey]);

  if (!episode || !run) return <NotFound />;

  const other = episode.runs.find((r) => r.id !== run.id);
  const score = run.score;
  const step = run.steps.find((s) => s.step === current) ?? run.steps[0];

  async function copy() {
    try {
      await navigator.clipboard.writeText(runConfig(episode!, run!));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-5">
      <nav aria-label={t("crumbs.label")} className="text-[13px] text-ink-muted">
        <Link to="/console/episodes" className="link text-ink-muted">
          {t("nav.episodes")}
        </Link>{" "}
        /{" "}
        <Link to={`/console/episodes/${episode.key}`} className="link text-ink-muted">
          {episodeLabel(t, episode)}
        </Link>{" "}
        / <span className="text-ink">{runLabel(t, run)}</span>
      </nav>

      <header className="border-b border-line pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[28px] leading-[1.15] font-medium tracking-[-0.015em] text-ink sm:text-[32px]">{runLabel(t, run)}</h1>
            <p className="mt-2 max-w-[62ch] text-[15px] text-ink-secondary">{runNote(t, run)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copy}>
              {copied ? t("episode.copied") : t("episode.copy")}
            </Button>
            {other ? (
              <ButtonLink to={`/console/episodes/${episode.key}/runs/${other.id}`} variant="primary">
                {t("run.switch", { name: runLabel(t, other) })}
              </ButtonLink>
            ) : null}
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 text-[14px] sm:grid-cols-4">
          <div>
            <dt className="text-[13px] text-ink-muted">{t("byline.episode")}</dt>
            <dd className="m-0 text-ink">{episodeLabel(t, episode)}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-muted">{t("byline.period")}</dt>
            <dd className="num m-0 text-ink">
              {date(episode.manifest.period_start)}–{date(episode.manifest.period_end)}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-muted">{t("run.actions")}</dt>
            <dd className="num m-0 text-ink">{run.steps.length}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-muted">{t("run.submitted")}</dt>
            <dd className="num m-0 text-ink">{run.findings.length}</dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel title={t("run.trace")} meta={run.steps.length ? n("unit.inspection", score.inspection_steps) : t("run.noCalls")} className="min-w-0 lg:col-span-8" bodyClassName="">
          {run.steps.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line text-[13px] text-ink-muted">
                    <th className="px-4 py-3 font-medium">№</th>
                    <th className="px-3 py-3 font-medium">{t("run.col.action")}</th>
                    <th className="px-3 py-3 font-medium">{t("run.col.result")}</th>
                    <th className="px-3 py-3 text-right font-medium">{t("run.col.cost")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("run.col.left")}</th>
                  </tr>
                </thead>
                <tbody ref={tableRef}>
                  {run.steps.map((s) => (
                    <tr key={s.step} data-step={s.step} className={`border-b border-line align-top transition-colors last:border-0 ${current === s.step ? "bg-paper-sunken" : ""}`}>
                      <td className="num px-4 py-3 text-[14px] text-ink-muted">{s.step}</td>
                      <td className="px-3 py-3">
                        <span className="block font-mono text-[14px] text-ink">{s.action.action}</span>
                        <span className="mt-0.5 block font-mono text-[13px] break-all text-ink-muted">{actionArgs(s)}</span>
                      </td>
                      <td className="px-3 py-3 text-[14px] text-ink-secondary">
                        {resultSummary(s, episode, t)}
                        <details className="mt-1">
                          <summary className="hit relative w-fit cursor-pointer text-[13px] text-ink-muted">{t("run.observation")}</summary>
                          <pre className="mt-1.5 max-h-56 overflow-auto rounded-control bg-paper-sunken p-2 font-mono text-[13px] leading-relaxed text-ink-secondary">
                            {JSON.stringify(s.observation.result, null, 2)}
                          </pre>
                        </details>
                      </td>
                      <td className="num px-3 py-3 text-right text-[14px] text-ink-secondary">{s.kind === "submit" ? "0.000" : "0.002"}</td>
                      <td className="num px-4 py-3 text-right text-[14px] text-ink-secondary">{s.observation.steps_remaining}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="double-rule">
                    <td className="px-4 py-3 text-[14px] text-ink" colSpan={3}>
                      {t("run.penalty")}
                    </td>
                    <td className="num px-3 py-3 text-right text-[14px] text-ink">{(0.002 * score.inspection_steps).toFixed(3)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="p-5 text-[15px] text-ink-secondary">{t("run.oracle.empty")}</p>
          )}
        </Panel>

        <aside className="min-w-0 lg:col-span-4">
          <div className="space-y-5 lg:sticky lg:top-[76px]">
            <Panel title={t("run.score")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-3">
                  {episode.truth.issues.length || score.fp ? <Marks marks={runMarks(episode, run, t)} /> : <span className="text-[14px] text-ink-muted">{t("archive.clean")}</span>}
                  <p className="text-[15px] leading-relaxed text-ink">{t("run.score.sentence", { r: rewardLabel(score.reward), f1: ratio(score.f1), s: score.inspection_steps })}</p>
                </div>
                <Verdict run={run} episode={episode} />
              </div>
              <dl className="mt-4 space-y-2 text-[14px]">
                <Leader label={t("run.tp")} value={score.tp} />
                <Leader label={t("run.fp")} value={<span className={score.fp ? "text-finding" : ""}>{score.fp}</span>} />
                <Leader label={t("run.fn")} value={<span className={score.fn ? "text-finding" : ""}>{score.fn}</span>} />
                <Leader label="P · R · F1" value={`${ratio(score.precision)} · ${ratio(score.recall)} · ${ratio(score.f1)}`} />
              </dl>
              <p className="num mt-4 rounded-control bg-paper-sunken px-3 py-2.5 text-[14px] text-ink">
                2 × {ratio(score.f1)} − 1 − 0.002 × {score.inspection_steps} = {rewardLabel(score.reward)}
              </p>
              <div className="mt-4">
                <MarksLegend />
              </div>
            </Panel>

            {run.steps.length && step ? (
              <Panel title={t("run.state", { n: step.step })}>
                <dl className="space-y-2 text-[14px]">
                  <Leader label={t("run.state.used")} value={step.observation.steps_used} />
                  <Leader label={t("run.state.left")} value={step.observation.steps_remaining} />
                  <Leader label={t("run.state.opened")} value={<span className="font-mono text-[13px]">{step.target || "—"}</span>} />
                  <Leader label={t("run.state.cost")} value={(0.002 * Math.min(step.step, score.inspection_steps)).toFixed(3)} />
                </dl>
              </Panel>
            ) : null}

            <Panel title={t("run.findings")} meta={run.findings.length}>
              {run.findings.length === 0 ? (
                <p className="text-[14px] text-ink-secondary">{t("run.findings.empty")}</p>
              ) : (
                <div className="space-y-4">
                  {run.findings.map((finding, index) => (
                    <div key={index} className="border-b border-line pb-4 last:border-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-ink">{typeLabel(t, finding.type)}</span>
                        <span className="font-mono text-[14px] text-ink">{money(finding.claimed_amount_minor, finding.currency)}</span>
                      </div>
                      <p className="mt-1.5 text-[13px] text-ink-muted">{t("run.findings.evidence")}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1">
                        {finding.evidence_ids.map((id) => (
                          <EvidenceLink key={id} episode={episode} raw={id} />
                        ))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EvidenceLink({ episode, raw }: { episode: Episode; raw: string }) {
  let table = raw.includes(":") ? "fx" : raw.startsWith("L-") ? "ledger" : raw.startsWith("PAY") ? "payments" : "invoices";
  let id = raw;
  if (raw.startsWith("DOC-")) {
    const inv = episode.invoices.find((i) => i.doc_id === raw);
    const pay = episode.payments.find((p) => p.doc_id === raw);
    table = inv ? "invoices" : "payments";
    id = inv?.invoice_id ?? pay?.payment_id ?? raw;
  }
  return (
    <Link to={`/console/episodes/${episode.key}?truth=1&record=${table}:${encodeURIComponent(id)}`} className="link hit relative font-mono text-[13px]">
      {raw}
    </Link>
  );
}

function Verdict({ run, episode }: { run: Run; episode: Episode }) {
  const { t } = useT();
  const d = date(episode.manifest.period_end);
  const common = { date: d, id: `${run.kind === "oracle" ? "OR" : "GR"}-${episode.key.toUpperCase()}`, animate: true, delay: 200 };
  if (run.kind === "oracle") return <Stamp key={run.id} tone="verified" code="O" label={t("stamp.oracle")} {...common} />;
  if (run.score.fp > 0) return <Stamp key={run.id} tone="finding" code="X" label={t("stamp.false")} {...common} />;
  if (run.score.fn > 0) return <Stamp key={run.id} tone="finding" code="M" label={t("stamp.missed")} {...common} />;
  if (run.findings.length > 0) return <Stamp key={run.id} tone="verified" code="✓" label={t("stamp.matched")} {...common} />;
  return <Stamp key={run.id} tone="verified" code="C" label={t("stamp.clean")} {...common} />;
}

function actionArgs(step: RunStep): string {
  const a = step.action;
  if (a.action === "list_records") return `table=${String(a.table)} limit=${String(a.limit ?? 50)}`;
  if (a.action === "get_record") return `table=${String(a.table)} id=${String(a.id)}`;
  if (a.action === "get_document") return `doc_id=${String(a.doc_id)}`;
  if (a.action === "submit") return `findings=${Array.isArray(a.findings) ? a.findings.length : 0}`;
  return "";
}

function resultSummary(step: RunStep, episode: Episode, t: T): string {
  const result = step.observation.result as Record<string, unknown> | null;
  if (!step.observation.ok) return step.observation.error?.message ?? t("run.result.failed");
  if (!result) return "—";
  if (Array.isArray(result.rows)) return t("run.result.rows", { n: result.rows.length, cursor: result.next_cursor ? String(result.next_cursor) : "—" });
  if (typeof result.row_id === "string") {
    const amountMinor = (Number(result.debit_minor) || 0) - (Number(result.credit_minor) || 0);
    return `${result.row_id} · ${accountName(t, String(result.account), episode.accounts[String(result.account)])} · ${signed(amountMinor)}`;
  }
  if (typeof result.invoice_id === "string") return `${result.invoice_id} · ${money(Number(result.total_minor), String(result.currency))}`;
  if (typeof result.payment_id === "string") return `${result.payment_id} · ${money(Number(result.amount_minor), String(result.currency))}`;
  if (typeof result.rate === "string") return `1 ${String(result.source_currency)} = ${result.rate} ${String(result.target_currency)} · ${date(String(result.date))}`;
  if (typeof result.submitted === "number") return t("run.result.submitted", { n: result.submitted });
  return t("run.result.record");
}
