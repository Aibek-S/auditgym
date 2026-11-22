import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Calculator, FileText, GraduationCap, Plus, Send, Trash2, X } from "lucide-react";
import { useT, type T } from "../lib/i18n";
import { amount, date, dateTime, money } from "../lib/format";
import { accountName, ISSUE_TYPES, typeLabel, typeNote } from "../lib/labels";
import { createSession, fetchTruth, health, sendStep, type LiveSession, type LiveStep, type LiveTruth, type Plan } from "../lib/live";
import type { Finding, FxRow, Invoice, IssueType, LedgerRow, Manifest, Payment, TruthIssue } from "../lib/types";
import { Button, ButtonLink } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { PageHeader } from "../components/ui/PageHeader";
import { TypeMark } from "../components/ui/TypeBadge";
import { Term } from "../components/ui/Term";
import { Budget } from "../components/practice/Budget";
import { Tour, type TourStep } from "../components/practice/Tour";
import { EvidenceLinks } from "../components/practice/EvidenceLinks";

type TableName = "ledger" | "invoices" | "payments" | "fx";
type Row = LedgerRow | Invoice | Payment | (FxRow & { fx_key: string });
interface TableState {
  rows: Row[];
  cursor: string | null;
  total: number;
}
interface OpenDoc {
  kind: "invoice" | "payment";
  document: Invoice | Payment;
}
interface Result {
  reward: number;
  truncated: boolean;
  truth: LiveTruth | null;
  findings: Finding[];
}

const TABLES: TableName[] = ["invoices", "payments", "ledger", "fx"];
const CASES: Plan[] = ["duplicate_invoice", "payment_allocation", "fx_conversion", "period_cutoff", "clean", "random"];
const MAX_IDS = 10;

function newSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % 1_000_000_000;
}

/** "78 400.00" / "78400,5" -> 7840000 / 7840050; null when it is not an amount. */
function parseAmount(text: string): number | null {
  const s = text.replace(/[\s ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, cents = ""] = s.split(".");
  return Number(whole) * 100 + Number(cents.padEnd(2, "0"));
}

function plainError(t: T, error: { code: string; message: string } | null): string {
  if (!error) return "";
  const key = `practice.error.${error.code}`;
  const text = t(key);
  return text === key ? t("practice.error", { msg: error.message }) : text;
}

export function PracticePage() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const [online, setOnline] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<"pick" | "starting" | "work" | "result">("pick");
  const [session, setSession] = useState<LiveSession | null>(null);
  const [used, setUsed] = useState(0);
  const [tables, setTables] = useState<Partial<Record<TableName, TableState>>>({});
  const [tab, setTab] = useState<TableName | "calc" | null>(null);
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [calcExpr, setCalcExpr] = useState("");
  const [calcValue, setCalcValue] = useState<string | null>(null);
  const [affected, setAffected] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<string[]>([]);
  const [ftype, setFtype] = useState<IssueType>("duplicate_invoice");
  const [famount, setFamount] = useState("");
  const [fwhy, setFwhy] = useState("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [tourStep, setTourStep] = useState<number | null>(params.get("tour") === "1" ? 0 : null);

  useEffect(() => {
    health()
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
  }, []);

  const manifest = (session?.observation.result as { manifest?: Manifest } | null)?.manifest;

  const reset = () => {
    setTables({});
    setTab(null);
    setDoc(null);
    setCalcExpr("");
    setCalcValue(null);
    setAffected([]);
    setEvidence([]);
    setFamount("");
    setFwhy("");
    setFindings([]);
    setConfirm(false);
    setNotice(null);
    setResult(null);
    setUsed(0);
  };

  async function start(plan: Plan) {
    reset();
    setPhase("starting");
    setFtype(plan === "clean" || plan === "random" ? "duplicate_invoice" : (plan as IssueType));
    try {
      // ?seed=2001 fixes the month (the demo video uses it); otherwise every start is a new month
      const fixed = Number(params.get("seed"));
      const s = await createSession(Number.isInteger(fixed) && fixed > 0 ? fixed : newSeed(), plan, "open");
      setSession(s);
      setPhase("work");
    } catch (e) {
      setNotice(t("practice.error", { msg: e instanceof Error ? e.message : String(e) }));
      setPhase("pick");
    }
  }

  const finish = useCallback(
    async (step: LiveStep, sent: Finding[]) => {
      if (!session) return;
      let truth: LiveTruth | null = null;
      try {
        truth = await fetchTruth(session.session);
      } catch {
        truth = null;
      }
      setResult({ reward: step.reward, truncated: step.truncated, truth, findings: sent });
      setPhase("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [session],
  );

  async function act(action: Record<string, unknown>, sent: Finding[] = findings): Promise<LiveStep | null> {
    if (!session || busy) return null;
    setBusy(true);
    setNotice(null);
    try {
      const step = await sendStep(session.session, action);
      setUsed(step.observation.steps_used);
      if (!step.observation.ok && !step.terminated) setNotice(plainError(t, step.observation.error));
      if (step.terminated || step.truncated) await finish(step, sent);
      return step;
    } catch (e) {
      setNotice(t("practice.error", { msg: e instanceof Error ? e.message : String(e) }));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function openTab(name: TableName | "calc") {
    setTab(name);
    if (name === "calc" || tables[name]) return;
    const step = await act({ action: "list_records", table: name, limit: 50 });
    const r = step?.observation.ok ? (step.observation.result as { rows: Row[]; next_cursor: string | null; total: number }) : null;
    if (r) setTables((prev) => ({ ...prev, [name]: { rows: r.rows, cursor: r.next_cursor, total: r.total } }));
  }

  async function more(name: TableName) {
    const cur = tables[name];
    if (!cur?.cursor) return;
    const step = await act({ action: "list_records", table: name, cursor: cur.cursor, limit: 50 });
    const r = step?.observation.ok ? (step.observation.result as { rows: Row[]; next_cursor: string | null }) : null;
    if (r) setTables((prev) => ({ ...prev, [name]: { rows: [...cur.rows, ...r.rows], cursor: r.next_cursor, total: cur.total } }));
  }

  async function openDoc(docId: string) {
    const step = await act({ action: "get_document", doc_id: docId });
    if (step?.observation.ok) setDoc(step.observation.result as OpenDoc);
  }

  async function calc() {
    const step = await act({ action: "calculator", expression: calcExpr });
    setCalcValue(step?.observation.ok ? (step.observation.result as { value: string }).value : null);
  }

  function toggle(list: string[], set: (v: string[]) => void, id: string) {
    if (list.includes(id)) return set(list.filter((x) => x !== id));
    if (list.length >= MAX_IDS) return setNotice(t("practice.err.limit"));
    set([...list, id]);
  }

  function addFinding() {
    if (!affected.length) return setNotice(t("practice.err.affected"));
    if (!evidence.length) return setNotice(t("practice.err.evidence"));
    const minor = parseAmount(famount);
    if (minor === null) return setNotice(t("practice.err.amount"));
    setFindings((prev) => [
      ...prev,
      { type: ftype, affected_ids: affected, claimed_amount_minor: minor, currency: "KZT", evidence_ids: evidence, explanation: fwhy.slice(0, 1000) },
    ]);
    setAffected([]);
    setEvidence([]);
    setFamount("");
    setFwhy("");
    setNotice(null);
  }

  async function submit() {
    if (!session) return;
    setConfirm(false);
    const sent = findings.map((f) => ({ ...f, explanation: f.explanation ?? "" }));
    await act({ action: "submit", findings: { episode_id: session.info.episode_id, findings: sent } }, sent);
  }

  // ---- tour: each step finishes by itself when the reader has done it
  const tourSteps: TourStep[] = useMemo(
    () => [
      { title: t("tour.0.title"), body: t("tour.0.body"), action: { label: t("tour.start"), run: () => void start("duplicate_invoice") }, done: phase === "work" },
      { title: t("tour.1.title"), body: t("tour.1.body"), target: '[data-tour="tab-invoices"]', done: Boolean(tables.invoices) },
      { title: t("tour.2.title"), body: t("tour.2.body"), target: '[data-tour="rows"]', done: doc !== null },
      { title: t("tour.3.title"), body: t("tour.3.body"), target: '[data-tour="rows"]', done: affected.length >= 2 },
      { title: t("tour.4.title"), body: t("tour.4.body"), target: '[data-tour="finding"]', done: findings.length >= 1 },
      { title: t("tour.5.title"), body: t("tour.5.body"), target: '[data-tour="submit"]', done: phase === "result" },
      { title: t("tour.6.title"), body: t("tour.6.body"), target: '[data-tour="result"]', done: false },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, phase, tables.invoices, doc, affected.length, findings.length],
  );

  const endTour = () => {
    setTourStep(null);
    if (params.get("tour")) {
      params.delete("tour");
      setParams(params, { replace: true });
    }
    try {
      localStorage.setItem("auditgym.tour", "done");
    } catch {
      /* storage blocked */
    }
  };

  // ---------------------------------------------------------------- render
  if (online === false) {
    return (
      <div className="space-y-5">
        <PageHeader title={t("practice.title")} description={t("practice.lede")} />
        <Panel>
          <p className="text-[16px] text-ink-secondary">{t("practice.offline")}</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className={`space-y-5 text-[15px] ${tourStep !== null ? "pb-[420px]" : ""}`}>
      <PageHeader
        title={t("practice.title")}
        description={t("practice.lede")}
        actions={
          tourStep === null ? (
            <Button onClick={() => setTourStep(phase === "pick" ? 0 : 1)}>
              <GraduationCap size={16} aria-hidden="true" /> {t("practice.tour")}
            </Button>
          ) : null
        }
      />

      {notice ? (
        <p role="status" className="rounded-card border border-finding/40 bg-finding-soft px-4 py-3 text-[15px] text-ink">
          {notice}
        </p>
      ) : null}

      {phase === "pick" || phase === "starting" ? (
        <Panel title={t("practice.pick")}>
          <p className="max-w-[68ch] text-ink-secondary">{t("practice.pick.hint")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CASES.map((plan, i) => (
              <button
                key={plan}
                type="button"
                disabled={phase === "starting" || online === null}
                onClick={() => void start(plan)}
                className="animate-rise group min-h-[112px] rounded-card border border-line-strong bg-paper-raised p-4 text-left transition-[border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-ink active:scale-[0.99] disabled:opacity-60"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className="flex items-center gap-2 text-[17px] font-medium text-ink">
                  {plan in ISSUE_TYPES_SET ? <TypeMark type={plan as IssueType} /> : null}
                  {t(`practice.case.${plan}.title`)}
                </span>
                <span className="mt-1.5 block text-[15px] leading-relaxed text-ink-secondary">{t(`practice.case.${plan}.body`)}</span>
              </button>
            ))}
          </div>
          {phase === "starting" ? <p className="mt-4 text-ink-muted" role="status">{t("practice.starting")}</p> : null}
        </Panel>
      ) : null}

      {phase === "work" && session ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="min-w-0 space-y-5 lg:col-span-8">
            <Panel>
              <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr] sm:items-end">
                <div>
                  <p className="text-[13px] text-ink-muted">
                    <Term k="period">{t("practice.month")}</Term>
                  </p>
                  <p className="mt-1 text-[20px] font-medium text-ink">
                    {manifest ? `${date(manifest.period_start)} – ${date(new Date(new Date(manifest.period_end).getTime() - 1).toISOString())}` : "—"}
                  </p>
                </div>
                <Budget used={used} />
              </div>
            </Panel>

            <Panel title={t("practice.tools")} bodyClassName="">
              <div className="flex flex-wrap gap-2 border-b border-line p-4" role="tablist" aria-label={t("practice.tools")}>
                {TABLES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={tab === name}
                    data-tour={`tab-${name}`}
                    disabled={busy}
                    onClick={() => void openTab(name)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-control border px-4 text-[15px] font-medium transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.98] ${tab === name ? "border-ink bg-ink text-on-ink" : "border-line-strong text-ink hover:border-ink"}`}
                  >
                    {t(`table.${name}`)}
                    {tables[name] ? <span className="num text-[13px] opacity-70">{tables[name]!.total}</span> : null}
                  </button>
                ))}
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "calc"}
                  onClick={() => void openTab("calc")}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-control border px-4 text-[15px] font-medium transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.98] ${tab === "calc" ? "border-ink bg-ink text-on-ink" : "border-line-strong text-ink hover:border-ink"}`}
                >
                  <Calculator size={16} aria-hidden="true" /> {t("practice.tool.calc")}
                </button>
              </div>

              <div data-tour="rows" className="min-h-[200px]">
                {tab === null ? <p className="p-5 text-ink-secondary">{t("practice.tab.hint")}</p> : null}
                {tab === "calc" ? (
                  <form
                    className="flex flex-wrap items-end gap-3 p-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void calc();
                    }}
                  >
                    <label className="block min-w-[220px] flex-1 text-[13px] text-ink-muted">
                      {t("practice.tool.calc")}
                      <input
                        value={calcExpr}
                        onChange={(e) => setCalcExpr(e.target.value)}
                        placeholder={t("practice.calc.placeholder")}
                        className="num mt-1 h-12 w-full rounded-control border border-line-strong bg-paper-raised px-3 text-[17px] text-ink"
                      />
                    </label>
                    <Button type="submit" variant="primary" disabled={busy || !calcExpr.trim()} className="!h-12">
                      {t("practice.calc.run")}
                    </Button>
                    {calcValue !== null ? (
                      <p className="animate-rise num w-full text-[22px] font-medium text-ink" role="status">
                        = {calcValue}
                      </p>
                    ) : null}
                  </form>
                ) : null}
                {tab && tab !== "calc" && tables[tab] ? (
                  <TableView
                    name={tab}
                    state={tables[tab]!}
                    affected={affected}
                    evidence={evidence}
                    busy={busy}
                    onOpen={(id) => void openDoc(id)}
                    onAffected={(id) => toggle(affected, setAffected, id)}
                    onEvidence={(id) => toggle(evidence, setEvidence, id)}
                    onMore={() => void more(tab)}
                  />
                ) : null}
              </div>
            </Panel>
          </div>

          <aside className="min-w-0 space-y-5 lg:col-span-4">
            <div data-tour="doc">
              <DocView doc={doc} onClose={() => setDoc(null)} />
            </div>

            <div data-tour="finding">
              <Panel title={<Term k="finding">{t("practice.finding.title")}</Term>}>
                <fieldset>
                  <legend className="text-[13px] text-ink-muted">{t("practice.finding.type")}</legend>
                  <div className="mt-1.5 grid gap-1.5">
                    {ISSUE_TYPES.map((type) => (
                      <label key={type} className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 transition-[border-color,background-color] duration-[120ms] ${ftype === type ? "border-ink bg-paper-sunken" : "border-line hover:border-line-strong"}`}>
                        <input type="radio" name="ftype" value={type} checked={ftype === type} onChange={() => setFtype(type)} className="h-4 w-4 accent-[var(--ink)]" />
                        <TypeMark type={type} />
                        <span className="text-[15px] text-ink">{typeLabel(t, type)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <IdList label={<Term k="affected">{t("practice.finding.affected")}</Term>} empty={t("practice.finding.affected.empty")} ids={affected} onRemove={(id) => toggle(affected, setAffected, id)} />
                <IdList label={<Term k="evidence">{t("practice.finding.evidence")}</Term>} empty={t("practice.finding.evidence.empty")} ids={evidence} tone="evidence" onRemove={(id) => toggle(evidence, setEvidence, id)} />
                <label className="mt-4 block text-[13px] text-ink-muted">
                  {t("practice.finding.amount")}
                  <input
                    value={famount}
                    onChange={(e) => setFamount(e.target.value)}
                    inputMode="decimal"
                    placeholder={t("practice.finding.amount.hint")}
                    className="num mt-1 h-12 w-full rounded-control border border-line-strong bg-paper-raised px-3 text-[17px] text-ink"
                  />
                </label>
                <label className="mt-4 block text-[13px] text-ink-muted">
                  {t("practice.finding.why")}
                  <textarea
                    value={fwhy}
                    maxLength={1000}
                    onChange={(e) => setFwhy(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-control border border-line-strong bg-paper-raised px-3 py-2 text-[15px] text-ink"
                  />
                </label>
                <Button variant="primary" className="mt-4 !h-12 w-full text-[15px]" onClick={addFinding}>
                  <Plus size={16} aria-hidden="true" /> {t("practice.finding.add")}
                </Button>
              </Panel>
            </div>

            <div data-tour="submit">
              <Panel title={t("practice.findings", { n: findings.length })}>
                {findings.length === 0 ? (
                  <p className="text-ink-secondary">{t("practice.findings.none")}</p>
                ) : (
                  <ol className="space-y-2.5">
                    {findings.map((f, i) => (
                      <li key={i} className="animate-rise flex items-start justify-between gap-3 border-b border-line pb-2.5 last:border-0">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-ink">
                            <TypeMark type={f.type} /> {typeLabel(t, f.type)} · <span className="num">{money(f.claimed_amount_minor)}</span>
                          </p>
                          <p className="mt-0.5 font-mono text-[13px] break-all text-ink-muted">{f.affected_ids.join(", ")}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={t("practice.finding.delete")}
                          title={t("practice.finding.delete")}
                          onClick={() => setFindings((prev) => prev.filter((_, k) => k !== i))}
                          className="hit relative grid h-9 w-9 shrink-0 place-items-center rounded-control text-ink-muted hover:text-finding"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                {confirm ? (
                  <div className="animate-rise mt-4 rounded-card border border-ink p-4" role="alertdialog" aria-label={t("practice.submit")}>
                    <p className="text-[16px] text-ink">{t("practice.confirm", { n: findings.length })}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="primary" className="!h-12" onClick={() => void submit()} disabled={busy}>
                        {t("practice.confirm.yes")}
                      </Button>
                      <Button className="!h-12" onClick={() => setConfirm(false)}>
                        {t("practice.confirm.no")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="primary" className="mt-4 !h-12 w-full text-[15px]" onClick={() => setConfirm(true)} disabled={busy}>
                    <Send size={16} aria-hidden="true" /> {findings.length ? t("practice.submit") : t("practice.submit.empty")}
                  </Button>
                )}
              </Panel>
            </div>
          </aside>
        </div>
      ) : null}

      {phase === "result" && result ? (
        <div data-tour="result">
          <ResultView result={result} onAgain={() => setPhase("pick")} />
        </div>
      ) : null}

      {tourStep !== null ? <Tour steps={tourSteps} index={tourStep} onIndex={setTourStep} onEnd={endTour} /> : null}
    </div>
  );
}

const ISSUE_TYPES_SET: Record<string, true> = Object.fromEntries(ISSUE_TYPES.map((x) => [x, true]));

// ---------------------------------------------------------------- tables

function MarkButton({ on, label, onClick, tone }: { on: boolean; label: string; onClick: () => void; tone: "finding" | "evidence" }) {
  const onCls = tone === "finding" ? "border-finding bg-finding text-paper-raised" : "border-evidence bg-evidence text-paper-raised";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-9 rounded-control border px-2.5 text-[13px] font-medium whitespace-nowrap transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${on ? onCls : "border-line-strong text-ink-secondary hover:border-ink hover:text-ink"}`}
    >
      {on ? "✓ " : ""}
      {label}
    </button>
  );
}

function TableView({
  name,
  state,
  affected,
  evidence,
  busy,
  onOpen,
  onAffected,
  onEvidence,
  onMore,
}: {
  name: TableName;
  state: TableState;
  affected: string[];
  evidence: string[];
  busy: boolean;
  onOpen: (docId: string) => void;
  onAffected: (id: string) => void;
  onEvidence: (id: string) => void;
  onMore: () => void;
}) {
  const { t } = useT();
  const th = "px-3 py-3 text-left text-[13px] font-medium text-ink-muted";
  const td = "px-3 py-2.5 align-middle text-[14px] whitespace-nowrap";
  const head: Record<TableName, string[]> = {
    invoices: ["practice.col.date", "practice.col.number", "practice.col.customer", "practice.col.amount", "practice.col.due", "practice.col.mark"],
    payments: ["practice.col.date", "practice.col.number", "practice.col.amount", "practice.col.refs", "practice.col.mark"],
    ledger: ["practice.col.date", "practice.col.account", "practice.col.debit", "practice.col.credit", "practice.col.links", "practice.col.mark"],
    fx: ["practice.col.date", "practice.col.currency", "practice.col.rate", "practice.col.mark"],
  };
  return (
    <div>
      <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead className="sticky top-0 z-10 bg-paper-raised">
            <tr className="border-b border-line">
              {head[name].map((k) => (
                <th key={k} className={th}>
                  {t(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row, i) => {
              if (name === "invoices") {
                const r = row as Invoice;
                return (
                  <tr key={r.doc_id} className="border-b border-line last:border-0 hover:bg-paper-sunken/60">
                    <td className={`${td} num text-ink-secondary`}>{dateTime(r.issued_at)}</td>
                    <td className={`${td} font-mono text-ink`}>{r.invoice_id}</td>
                    <td className={`${td} font-mono text-ink-muted`}>{r.entity_id}</td>
                    <td className={`${td} num text-right text-ink`}>{money(r.total_minor, r.currency)}</td>
                    <td className={`${td} num text-ink-muted`}>{date(r.due_at)}</td>
                    <td className={td}>
                      <span className="flex flex-nowrap gap-1.5">
                        <Button size="sm" disabled={busy} onClick={() => onOpen(r.doc_id)} className="!min-h-9">
                          <FileText size={14} aria-hidden="true" /> {t("practice.open")}
                        </Button>
                        <MarkButton tone="finding" on={affected.includes(r.invoice_id)} label={t("practice.mark.affected")} onClick={() => onAffected(r.invoice_id)} />
                        <MarkButton tone="evidence" on={evidence.includes(r.doc_id)} label={t("practice.mark.evidence")} onClick={() => onEvidence(r.doc_id)} />
                      </span>
                    </td>
                  </tr>
                );
              }
              if (name === "payments") {
                const r = row as Payment;
                return (
                  <tr key={r.doc_id} className="border-b border-line last:border-0 hover:bg-paper-sunken/60">
                    <td className={`${td} num text-ink-secondary`}>{dateTime(r.timestamp)}</td>
                    <td className={`${td} font-mono text-ink`}>{r.payment_id}</td>
                    <td className={`${td} num text-right text-ink`}>{money(r.amount_minor, r.currency)}</td>
                    <td className={`${td} font-mono text-[13px] text-ink-muted`}>{r.invoice_refs?.join(", ") ?? t("practice.norefs")}</td>
                    <td className={td}>
                      <span className="flex flex-nowrap gap-1.5">
                        <Button size="sm" disabled={busy} onClick={() => onOpen(r.doc_id)} className="!min-h-9">
                          <FileText size={14} aria-hidden="true" /> {t("practice.open")}
                        </Button>
                        <MarkButton tone="finding" on={affected.includes(r.payment_id)} label={t("practice.mark.affected")} onClick={() => onAffected(r.payment_id)} />
                        <MarkButton tone="evidence" on={evidence.includes(r.doc_id)} label={t("practice.mark.evidence")} onClick={() => onEvidence(r.doc_id)} />
                      </span>
                    </td>
                  </tr>
                );
              }
              if (name === "ledger") {
                const r = row as LedgerRow;
                return (
                  <tr key={r.row_id} className="border-b border-line last:border-0 hover:bg-paper-sunken/60">
                    <td className={`${td} num text-ink-secondary`}>{dateTime(r.timestamp)}</td>
                    <td className={`${td} text-ink`}>
                      <span className="num text-ink-muted">{r.account}</span> {accountName(t, r.account)}
                    </td>
                    <td className={`${td} num text-right text-ink`}>{r.debit_minor ? amount(r.debit_minor) : ""}</td>
                    <td className={`${td} num text-right text-ink`}>{r.credit_minor ? amount(r.credit_minor) : ""}</td>
                    <td className={`${td} font-mono text-[13px] text-ink-muted`}>{[r.invoice_id, r.payment_id].filter(Boolean).join(" · ") || "—"}</td>
                    <td className={td}>
                      <MarkButton tone="evidence" on={evidence.includes(r.row_id)} label={t("practice.mark.evidence")} onClick={() => onEvidence(r.row_id)} />
                    </td>
                  </tr>
                );
              }
              const r = row as FxRow & { fx_key: string };
              return (
                <tr key={r.fx_key ?? i} className="border-b border-line last:border-0 hover:bg-paper-sunken/60">
                  <td className={`${td} num text-ink-secondary`}>{date(r.date)}</td>
                  <td className={`${td} font-mono text-ink`}>{r.source_currency}</td>
                  <td className={`${td} num text-ink`}>{r.rate}</td>
                  <td className={td}>
                    <MarkButton tone="evidence" on={evidence.includes(r.fx_key)} label={t("practice.mark.evidence")} onClick={() => onEvidence(r.fx_key)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
        <span className="num text-[14px] text-ink-muted">{t("practice.shown", { n: state.rows.length, total: state.total })}</span>
        {state.cursor ? (
          <Button onClick={onMore} disabled={busy} className="!h-11">
            {t("practice.more")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DocView({ doc, onClose }: { doc: OpenDoc | null; onClose: () => void }) {
  const { t } = useT();
  if (!doc) {
    return (
      <Panel title={t("practice.doc.title")}>
        <p className="text-ink-secondary">{t("practice.doc.empty")}</p>
      </Panel>
    );
  }
  const close = (
    <button type="button" onClick={onClose} aria-label={t("practice.doc.close")} className="hit relative grid h-8 w-8 place-items-center rounded-control text-ink-muted hover:text-ink">
      <X size={16} aria-hidden="true" />
    </button>
  );
  if (doc.kind === "payment") {
    const p = doc.document as Payment;
    return (
      <Panel title={<span className="font-mono">{p.payment_id}</span>} meta={close} className="animate-rise">
        <dl className="space-y-2">
          <Row label={t("practice.col.date")} value={dateTime(p.timestamp)} />
          <Row label={t("practice.col.amount")} value={money(p.amount_minor, p.currency)} />
          <Row label={t("practice.col.refs")} value={p.invoice_refs?.join(", ") ?? t("practice.norefs")} />
        </dl>
      </Panel>
    );
  }
  const inv = doc.document as Invoice;
  return (
    <Panel key={inv.doc_id} title={<span className="font-mono">{inv.invoice_id}</span>} meta={close} className="animate-rise">
      <dl className="space-y-2">
        <Row label={t("practice.col.date")} value={dateTime(inv.issued_at)} />
        <Row label={t("practice.col.customer")} value={inv.entity_id} />
      </dl>
      <p className="mt-4 text-[13px] text-ink-muted">{t("practice.doc.goods")}</p>
      <ul className="mt-1.5 space-y-2.5">
        {inv.line_items.map((li) => (
          <li key={li.line_no} className="border-b border-line pb-2.5 last:border-0">
            <p className="text-ink">{li.description}</p>
            <p className="num mt-0.5 text-[14px] text-ink-secondary">
              {li.quantity} × {amount(li.unit_price_minor)} = {amount(li.amount_minor)}
            </p>
            <p className="mt-1 text-[14px]">
              <span className="text-ink-muted">
                <Term k="delivery_note">{t("practice.doc.note")}</Term>:
              </span>{" "}
              <span className="rounded-control bg-evidence-soft px-1.5 py-0.5 font-mono font-medium text-evidence">{li.delivery_note_id}</span>
              {li.ref_invoice_id ? <span className="ml-2 text-ink-muted">{t("practice.doc.ref", { id: li.ref_invoice_id })}</span> : null}
            </p>
          </li>
        ))}
      </ul>
      <p className="double-rule num mt-3 pt-2 text-right text-[17px] font-medium text-ink">
        {t("practice.doc.total")}: {money(inv.total_minor, inv.currency)}
      </p>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="leader text-[15px]">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="m-0 text-right font-mono text-[14px] break-all text-ink">{value}</dd>
    </div>
  );
}

function IdList({ label, empty, ids, onRemove, tone = "finding" }: { label: ReactNode; empty: string; ids: string[]; onRemove: (id: string) => void; tone?: "finding" | "evidence" }) {
  const { t } = useT();
  return (
    <div className="mt-4">
      <p className="text-[13px] text-ink-muted">{label}</p>
      {ids.length === 0 ? (
        <p className="mt-1 text-[14px] text-ink-secondary">{empty}</p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <li key={id} className="animate-rise">
              <button
                type="button"
                onClick={() => onRemove(id)}
                aria-label={t("practice.finding.remove", { id })}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-control border px-2.5 font-mono text-[13px] ${tone === "evidence" ? "border-evidence/50 bg-evidence-soft text-evidence" : "border-finding/50 bg-finding-soft text-finding"}`}
              >
                {id} <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- result

function ResultView({ result, onAgain }: { result: Result; onAgain: () => void }) {
  const { t } = useT();
  const ev = (result.truth?.evaluation ?? {}) as { tp?: number; fp?: number; fn?: number; f1?: number; inspection_steps?: number; matched?: Record<string, string> };
  const issues = result.truth?.issues ?? [];
  const matched = ev.matched ?? {};
  const matchedIssues = new Set(Object.values(matched));
  const missed = issues.filter((i) => !matchedIssues.has(i.issue_id));
  const tp = ev.tp ?? 0;
  const fp = ev.fp ?? 0;
  const fn = ev.fn ?? 0;
  const f1 = ev.f1 ?? 0;
  const steps = ev.inspection_steps ?? 0;
  const r = result.reward;
  const good = r > 0.5;

  return (
    <div className="space-y-5">
      <Panel title={t("practice.result.title")}>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-[13px] text-ink-muted">
              <Term k="reward">{t("practice.result.reward")}</Term>
            </p>
            <p className={`num animate-stamp mt-1 text-[44px] leading-none font-medium ${good ? "text-verified" : "text-finding"}`}>{r.toFixed(3)}</p>
          </div>
          <p className="text-[17px] text-ink">{t("practice.result.counts", { tp, fp, fn })}</p>
        </div>
        <ol className="mt-5 space-y-2 text-[16px]">
          <li className="formula-term num" style={{ animationDelay: "150ms" }}>
            <span className="text-ink-muted">
              <Term k="f1">{t("practice.formula.f1")}</Term>:
            </span>{" "}
            F1 = 2·{tp} / (2·{tp} + {fp} + {fn}) = <strong>{f1.toFixed(3)}</strong>
          </li>
          <li className="formula-term num" style={{ animationDelay: "450ms" }}>
            <span className="text-ink-muted">{t("practice.formula.steps")}:</span> S = <strong>{steps}</strong>
          </li>
          <li className="formula-term num" style={{ animationDelay: "750ms" }}>
            <span className="text-ink-muted">{t("practice.formula.r")}:</span> R = 2·{f1.toFixed(3)} − 1 − 0.002·{steps} = <strong>{r.toFixed(3)}</strong>
          </li>
        </ol>
        {result.truncated ? <p className="mt-4 text-ink-secondary">{t("practice.result.truncated")}</p> : null}
        {issues.length === 0 && result.findings.length === 0 ? <p className="mt-4 text-ink-secondary">{t("practice.result.clean")}</p> : null}
      </Panel>

      {result.findings.map((f, i) => {
        const issue = issues.find((x) => x.issue_id === matched[String(i)]);
        return (
          <Panel
            key={`f${i}`}
            className="formula-term"
            title={
              <span className="flex items-center gap-2">
                <TypeMark type={f.type} /> {typeLabel(t, f.type)} · <span className="num">{money(f.claimed_amount_minor)}</span>
              </span>
            }
            meta={<Verdict kind={issue ? "right" : "wrong"} delay={900 + i * 200} />}
          >
            <p className="font-mono text-[13px] break-all text-ink-muted">{f.affected_ids.join(", ")}</p>
            {issue ? (
              <EvidenceLinks yours={f.evidence_ids} needed={bestSet(issue, f.evidence_ids)} delay={1000 + i * 200} />
            ) : (
              <p className="mt-3 text-ink-secondary">{t("practice.result.wrong.body")}</p>
            )}
          </Panel>
        );
      })}

      {missed.map((issue, i) => (
        <Panel
          key={issue.issue_id}
          className="formula-term"
          title={
            <span className="flex items-center gap-2">
              <TypeMark type={issue.type} /> {typeLabel(t, issue.type)} · <span className="num">{money(issue.expected_amount_minor, issue.currency)}</span>
            </span>
          }
          meta={<Verdict kind="missed" delay={1100 + (result.findings.length + i) * 200} />}
        >
          <p className="text-ink-secondary">{typeNote(t, issue.type)}</p>
          <p className="mt-2 text-[14px]">
            <span className="text-ink-muted">{t("guide.error.affected")}:</span> <span className="font-mono break-all text-ink">{issue.affected_ids.join(", ")}</span>
          </p>
          <p className="mt-1 text-[14px]">
            <span className="text-ink-muted">{t("guide.error.evidence")}:</span> <span className="font-mono break-all text-evidence">{issue.evidence_sets[0]?.join(", ")}</span>
          </p>
        </Panel>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" className="!h-12 text-[15px]" onClick={onAgain}>
          {t("practice.again")}
        </Button>
        <ButtonLink to="/console/guide" className="!h-12 text-[15px]">
          <BookOpen size={16} aria-hidden="true" /> {t("practice.toGuide")}
        </ButtonLink>
      </div>
    </div>
  );
}

/** The acceptable evidence set that the reader's ids cover, else the first one. */
function bestSet(issue: TruthIssue, yours: string[]): string[] {
  return issue.evidence_sets.find((set) => set.every((id) => yours.includes(id))) ?? issue.evidence_sets[0] ?? [];
}

function Verdict({ kind, delay }: { kind: "right" | "wrong" | "missed"; delay: number }) {
  const { t } = useT();
  const tone = kind === "right" ? "text-verified" : kind === "wrong" ? "text-finding" : "text-ink-secondary";
  return (
    <span className={`stamp animate-stamp ${tone}`} style={{ animationDelay: `${delay}ms` }}>
      <span className="stamp__code" aria-hidden="true">
        {kind === "right" ? "✓" : kind === "wrong" ? "×" : "?"}
      </span>
      <span className="stamp__label">{t(`practice.verdict.${kind}`)}</span>
    </span>
  );
}

