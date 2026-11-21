import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { findEpisode, useDemo, useTruthHash } from "../lib/data";
import { useT } from "../lib/i18n";
import { date, money } from "../lib/format";
import { episodeLabel, runConfig, tableHint, tableLabel, typeLabel } from "../lib/labels";
import { filterRecords, refFromRawId, tableCount, truthMarks, type RecordRef, type TableName } from "../lib/records";
import { Button, ButtonLink } from "../components/ui/Button";
import { ChipButton } from "../components/ui/Chips";
import { RecordList } from "../components/workbench/RecordList";
import { EpisodeBrief, RecordDetail } from "../components/workbench/RecordDetail";
import { NotFound } from "./NotFound";

const TABLES: TableName[] = ["ledger", "invoices", "payments", "fx"];
const PAGE = 25;

export function EpisodePage() {
  const data = useDemo();
  const { t, n } = useT();
  const { episodeKey } = useParams();
  const [params, setParams] = useSearchParams();
  const episode = findEpisode(data, episodeKey);
  const hash = useTruthHash(episode);

  const [table, setTable] = useState<TableName>("ledger");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<RecordRef | null>(null);
  const [copied, setCopied] = useState(false);
  const truthOn = params.get("truth") === "1" || params.has("issue");
  const sheetRef = useRef<HTMLDivElement>(null);

  // ?issue=ISS-01 opens the truth and the first affected record; ?record=ledger:L-ABC opens a record.
  useEffect(() => {
    if (!episode) return;
    const issueId = params.get("issue");
    const recordParam = params.get("record");
    if (recordParam) {
      const [tbl, ...rest] = recordParam.split(":");
      const id = rest.join(":");
      if (TABLES.includes(tbl as TableName)) open({ table: tbl as TableName, id });
    } else if (issueId) {
      const issue = episode.truth.issues.find((i) => i.issue_id === issueId);
      const ref = issue ? refFromRawId(episode, issue.affected_ids[0]) : null;
      if (ref) open(ref);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.key]);

  useEffect(() => setPage(0), [table, query]);

  const marks = useMemo(() => (episode ? truthMarks(episode) : { affected: new Set<string>(), evidence: new Set<string>() }), [episode]);
  const filtered = useMemo(() => (episode ? filterRecords(episode, table, query) : []), [episode, table, query]);

  if (!episode) return <NotFound />;

  function open(ref: RecordRef) {
    setTable(ref.table);
    setQuery("");
    setSelected(ref);
    const rows = filterRecords(episode!, ref.table, "");
    const index = rows.findIndex((row) => {
      const r = row as unknown as Record<string, string>;
      return r.row_id === ref.id || r.invoice_id === ref.id || r.payment_id === ref.id || `${r.date}:${r.source_currency}:${r.target_currency}` === ref.id;
    });
    if (index >= 0) setPage(Math.floor(index / PAGE));
  }

  function setTruth(on: boolean) {
    const next = new URLSearchParams(params);
    if (on) next.set("truth", "1");
    else {
      next.delete("truth");
      next.delete("issue");
    }
    setParams(next, { replace: true });
  }

  async function copyConfig() {
    const run = episode!.runs.find((r) => r.kind === "replay") ?? episode!.runs[0];
    try {
      await navigator.clipboard.writeText(runConfig(episode!, run));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);
  const guided = episode.runs.find((r) => r.kind === "replay");

  return (
    <div className="space-y-5">
      <nav aria-label={t("crumbs.label")} className="text-[13px] text-ink-muted">
        <Link to="/console/episodes" className="link text-ink-muted">
          {t("nav.episodes")}
        </Link>{" "}
        / <span className="text-ink">{episodeLabel(t, episode)}</span>
      </nav>

      <header className="border-b border-line pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[28px] leading-[1.15] font-medium tracking-[-0.015em] text-ink sm:text-[32px]">{episodeLabel(t, episode)}</h1>
            <p className="mt-2 max-w-[62ch] text-[15px] text-ink-secondary">{t("episode.lead")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setTruth(!truthOn)} aria-pressed={truthOn}>
              {truthOn ? t("episode.truth.hide") : t("episode.truth.show")}
            </Button>
            {guided ? (
              <ButtonLink to={`/console/episodes/${episode.key}/runs/${guided.id}`} variant="secondary">
                {t("episode.guided")}
              </ButtonLink>
            ) : null}
          </div>
        </div>

        {/* Byline grid (after Distill) and provenance strip (after Our World in Data). */}
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 text-[14px] sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <dt className="text-[13px] text-ink-muted">{t("byline.period")}</dt>
            <dd className="num m-0 text-ink">
              {date(episode.manifest.period_start)}–{date(episode.manifest.period_end)}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-muted">{t("byline.source")}</dt>
            <dd className="m-0 text-ink">{episode.source === "fixture" ? t("ep.source.fixture") : t("ep.source.generated", { seed: episode.seed ?? "—" })}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-muted">{t("byline.documents")}</dt>
            <dd className="num m-0 text-ink">{episode.manifest.counts.documents}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-muted">{t("byline.ledger")}</dt>
            <dd className="num m-0 text-ink">{episode.manifest.counts.ledger}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-muted">{t("byline.findings")}</dt>
            <dd className="m-0 text-ink">{truthOn ? episode.truth.issues.length : t("byline.sealed")}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-muted">{t("byline.schema")}</dt>
            <dd className="num m-0 text-ink">
              {episode.manifest.schema_version} · {episode.manifest.rounding}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-muted">
          <span>
            {t("prov.key")} <span className="font-mono text-ink-secondary">{hash ? `${hash.slice(0, 16)}…` : "…"}</span>
          </span>
          <span>{n("unit.change", episode.truth.provenance.changes.length)}</span>
          <span>{n("unit.distractor", episode.truth.provenance.distractors.length)}</span>
          <span className="font-mono">{episode.manifest.episode_id}</span>
          <button type="button" onClick={copyConfig} className="link hit relative text-ink-secondary">
            {copied ? t("episode.copied") : t("episode.copy")}
          </button>
        </div>
      </header>

      {truthOn ? <FindingsSummary episodeKey={episode.key} onOpen={open} /> : null}

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="min-w-0 rounded-card border border-line bg-paper-raised lg:col-span-8" aria-label={t("workbench.label")}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            {TABLES.map((name) => (
              <ChipButton key={name} active={table === name} onClick={() => { setTable(name); setQuery(""); }}>
                {tableLabel(t, name)} <span className="num opacity-70">{tableCount(episode, name)}</span>
              </ChipButton>
            ))}
            <label className="relative ml-auto w-full sm:w-56">
              <span className="sr-only">{t("workbench.search")}</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("workbench.search")}
                className="h-9 w-full rounded-control border border-line-strong bg-paper px-3 text-[14px] text-ink outline-none placeholder:text-ink-muted focus:border-ink pointer-coarse:h-11"
              />
            </label>
          </div>
          <p className="border-b border-line px-4 py-2.5 text-[13px] text-ink-muted">
            {tableHint(t, table)}
            {truthOn ? (
              <span className="ml-3 inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-4 rounded-[1px] bg-finding-soft ring-1 ring-finding" /> {t("lens.finding")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-4 rounded-[1px] bg-evidence-soft ring-1 ring-evidence" /> {t("lens.evidence")}
                </span>
              </span>
            ) : null}
          </p>
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-[14px] text-ink-secondary">{t("workbench.empty", { q: query })}</p>
          ) : (
            <RecordList
              episode={episode}
              table={table}
              rows={visible}
              allRows={filtered}
              marks={marks}
              truthOn={truthOn}
              selectedId={selected?.table === table ? selected.id : null}
              onSelect={(id) => setSelected({ table, id })}
            />
          )}
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-muted">
            <span className="num">{t("workbench.range", { from: filtered.length ? safePage * PAGE + 1 : 0, to: Math.min(filtered.length, (safePage + 1) * PAGE), total: filtered.length })}</span>
            <span className="flex items-center gap-2">
              <Button size="sm" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} aria-label={t("workbench.prev")}>
                ←
              </Button>
              <span className="num">
                {safePage + 1} / {pageCount}
              </span>
              <Button size="sm" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage >= pageCount - 1} aria-label={t("workbench.next")}>
                →
              </Button>
            </span>
          </div>
        </section>

        <aside className="hidden min-w-0 lg:col-span-4 lg:block">
          <div className="sticky top-[76px] max-h-[calc(100vh-96px)] overflow-y-auto rounded-card border border-line bg-paper-raised">
            {selected ? (
              <RecordDetail episode={episode} selected={selected} truthOn={truthOn} marks={marks} onOpen={open} />
            ) : (
              <EpisodeBrief episode={episode} />
            )}
          </div>
        </aside>
      </div>

      {selected ? (
        <div ref={sheetRef} className="fixed inset-0 z-40 overflow-y-auto bg-paper-raised shadow-[0_-12px_40px_rgba(0,0,0,0.25)] lg:hidden" role="dialog" aria-modal="true" aria-labelledby="record-h">
          <RecordDetail episode={episode} selected={selected} truthOn={truthOn} marks={marks} onOpen={open} onClose={() => setSelected(null)} />
        </div>
      ) : null}
    </div>
  );
}

// The list of findings at the top, each linked to the rows it marks (after GOV.UK's error summary).
function FindingsSummary({ episodeKey, onOpen }: { episodeKey: string; onOpen: (ref: RecordRef) => void }) {
  const data = useDemo();
  const { t, n } = useT();
  const episode = findEpisode(data, episodeKey)!;
  const issues = episode.truth.issues;
  return (
    <section aria-labelledby="findings-h" className="rounded-card border-2 border-finding bg-paper-raised p-5">
      <h2 id="findings-h" className="text-[17px] font-medium text-ink">
        {issues.length ? n("unit.issueInKey", issues.length) : t("findings.clean")}
      </h2>
      {issues.length ? (
        <ul className="mt-3 space-y-2.5">
          {issues.map((issue) => (
            <li key={issue.issue_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
              <span className="font-mono text-ink-muted">{issue.issue_id}</span>
              <span className="font-medium text-ink">{typeLabel(t, issue.type)}</span>
              <span className="font-mono text-ink">{money(issue.expected_amount_minor, issue.currency)}</span>
              <span className="text-ink-muted">{t("findings.affected")}</span>
              {issue.affected_ids.map((raw) => {
                const ref = refFromRawId(episode, raw);
                return ref ? (
                  <button key={raw} type="button" onClick={() => onOpen(ref)} className="link hit relative font-mono text-[13px] text-finding">
                    {raw}
                  </button>
                ) : (
                  <span key={raw} className="font-mono text-[13px]">
                    {raw}
                  </span>
                );
              })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[14px] text-ink-secondary">{t("findings.clean.body")}</p>
      )}
    </section>
  );
}
