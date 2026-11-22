import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Send, Square } from "lucide-react";
import { Budget } from "../components/practice/Budget";
import { useT } from "../lib/i18n";
import { money } from "../lib/format";
import { typeLabel } from "../lib/labels";
import { createSession, fetchTruth, health, LIVE_API, PLANS, policies, sendStep, streamRun, type LiveSession, type LiveStep, type LiveTruth, type Plan } from "../lib/live";
import { Button } from "../components/ui/Button";
import { Leader, Panel } from "../components/ui/Panel";
import { PageHeader } from "../components/ui/PageHeader";

type Status = "checking" | "offline" | "idle" | "running" | "done";

const SPEEDS = [{ ms: 600, key: "live.speed.x1" }, { ms: 300, key: "live.speed.x2" }, { ms: 120, key: "live.speed.x4" }];

export function LivePage() {
  const { t } = useT();
  const [status, setStatus] = useState<Status>("checking");
  const [scored, setScored] = useState(false);
  const [agents, setAgents] = useState<string[]>(["reconcile"]);
  const [seed, setSeed] = useState(2001);
  const [plan, setPlan] = useState<Plan>("duplicate_invoice");
  const [mode, setMode] = useState<"open" | "closed">("open");
  const [agent, setAgent] = useState("reconcile");
  const [speed, setSpeed] = useState(600);
  // the stream arrives at full speed into a queue; the player shows it at the chosen pace and can pause
  const queue = useRef<LiveStep[]>([]);
  const [pending, setPending] = useState(0);
  const [paused, setPaused] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [truth, setTruth] = useState<LiveTruth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('{"action": "list_records", "table": "invoices", "limit": 10}');
  const stopRef = useRef<(() => void) | null>(null);
  const endRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    health()
      .then((h) => {
        setScored(h.scored);
        setStatus("idle");
        return policies().then(setAgents);
      })
      .catch(() => setStatus("offline"));
    return () => stopRef.current?.();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [steps.length]);

  useEffect(() => {
    if (paused || pending === 0) return;
    const id = window.setTimeout(() => {
      const next = queue.current.shift();
      if (next) setSteps((prev) => [...prev, next]);
      setPending(queue.current.length);
    }, speed);
    return () => window.clearTimeout(id);
  }, [paused, pending, speed, steps.length]);

  const last = steps[steps.length - 1];
  const finished = Boolean(last && (last.terminated || last.truncated));
  const stepsUsed = last?.observation.steps_used ?? 0;

  async function begin(): Promise<LiveSession | null> {
    stopRef.current?.();
    setError(null);
    setSteps([]);
    setTruth(null);
    setSession(null);
    setBusy(true);
    try {
      const s = await createSession(seed, plan, mode);
      setSession(s);
      setStatus("idle");
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function finish(s: LiveSession) {
    setStatus("done");
    try {
      setTruth(await fetchTruth(s.session));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (streamEnded && pending === 0 && session && status === "running") {
      setStreamEnded(false);
      void finish(session);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamEnded, pending, session, status]);

  async function runAgent() {
    const s = session && !finished && steps.length === 0 ? session : await begin();
    if (!s) return;
    queue.current = [];
    setPending(0);
    setPaused(false);
    setStreamEnded(false);
    setStatus("running");
    stopRef.current = streamRun(
      s.session,
      agent,
      0,
      (step) => {
        queue.current.push(step);
        setPending(queue.current.length);
      },
      () => setStreamEnded(true),
      (message) => {
        setError(message);
        setStatus("idle");
      },
    );
  }

  function stop() {
    stopRef.current?.();
    stopRef.current = null;
    queue.current = [];
    setPending(0);
    setPaused(false);
    setStatus("idle");
  }

  async function manualStep() {
    let action: unknown;
    try {
      action = JSON.parse(manual);
    } catch {
      setError(t("live.manual.badJson"));
      return;
    }
    const s = session && !finished ? session : await begin();
    if (!s) return;
    try {
      const step = await sendStep(s.session, action);
      setSteps((prev) => [...prev, step]);
      if (step.terminated || step.truncated) void finish(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (status === "offline") {
    return (
      <div className="space-y-5">
        <PageHeader title={t("live.title")} description={t("live.lede")} />
        <Panel title={t("live.offline.title")}>
          <p className="text-[15px] text-ink-secondary">{t("live.offline.body")}</p>
          <pre className="mt-3 rounded-control bg-paper-sunken p-3 font-mono text-[13px] text-ink">python -m auditgym serve --port 8765</pre>
          <p className="mt-3 text-[13px] text-ink-muted">{LIVE_API}</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t("live.title")} description={t("live.lede")} />

      <Panel title={t("live.setup")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="block text-[13px] text-ink-muted">
            {t("live.seed")}
            <input
              type="number"
              min={0}
              value={seed}
              onChange={(e) => setSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="num mt-1 h-10 w-full rounded-control border border-line-strong bg-paper-raised px-3 text-[14px] text-ink"
            />
          </label>
          <label className="block text-[13px] text-ink-muted lg:col-span-2">
            {t("live.plan")}
            <select value={plan} onChange={(e) => setPlan(e.target.value as Plan)} className="mt-1 h-10 w-full rounded-control border border-line-strong bg-paper-raised px-3 text-[14px] text-ink">
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {t(`live.plan.${p}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px] text-ink-muted">
            {t("live.agent")}
            <select value={agent} onChange={(e) => setAgent(e.target.value)} className="mt-1 h-10 w-full rounded-control border border-line-strong bg-paper-raised px-3 font-mono text-[14px] text-ink">
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="text-[13px] text-ink-muted">
            <legend>{t("live.mode")}</legend>
            <div className="mt-1 flex gap-1" role="group">
              {(["open", "closed"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`h-10 flex-1 rounded-control border text-[13px] ${mode === m ? "border-ink bg-ink text-on-ink" : "border-line-strong text-ink-secondary"}`}>
                  {t(`live.mode.${m}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="text-[13px] text-ink-muted">
            <legend>{t("live.speed")}</legend>
            <div className="mt-1 flex gap-1" role="group">
              {SPEEDS.map((s) => (
                <button key={s.ms} type="button" aria-pressed={speed === s.ms} onClick={() => setSpeed(s.ms)} className={`h-10 flex-1 rounded-control border text-[13px] ${speed === s.ms ? "border-ink bg-ink text-on-ink" : "border-line-strong text-ink-secondary"}`}>
                  {t(s.key)}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {status === "running" ? (
            <Button variant="primary" onClick={stop}>
              <Square size={16} aria-hidden="true" /> {t("live.stop")}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void runAgent()} disabled={busy}>
              <Play size={16} aria-hidden="true" /> {t("live.run")}
            </Button>
          )}
          {status === "running" ? (
            <Button onClick={() => setPaused((v) => !v)} aria-pressed={paused}>
              {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />} {paused ? t("live.resume") : t("live.pause")}
            </Button>
          ) : null}
          <Button onClick={() => void begin()} disabled={status === "running" || busy}>
            <RotateCcw size={16} aria-hidden="true" /> {t("live.reset")}
          </Button>
          {status === "running" ? (
            <span className="inline-flex items-center gap-2 text-[13px] text-ink-muted">
              {paused ? t("live.paused", { n: stepsUsed }) : t("live.running")}
            </span>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-[14px] text-finding">{error}</p> : null}
        {!scored ? <p className="mt-3 text-[13px] text-ink-muted">{t("live.unscored")}</p> : null}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel title={t("run.trace")} meta={`${stepsUsed} / 100`} className="min-w-0 lg:col-span-8" bodyClassName="">
          {steps.length === 0 ? (
            <p className="p-5 text-[15px] text-ink-secondary">{t("live.empty")}</p>
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[600px] border-collapse text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-line bg-paper-raised text-[13px] text-ink-muted [&>th]:bg-paper-raised">
                    <th className="px-4 py-3 font-medium">№</th>
                    <th className="px-3 py-3 font-medium">{t("run.col.action")}</th>
                    <th className="px-3 py-3 font-medium">{t("run.col.result")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("run.col.left")}</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((s, i) => (
                    <tr key={i} ref={i === steps.length - 1 ? endRef : undefined} className="live-row border-b border-line align-top last:border-0">
                      <td className="num px-4 py-2.5 text-[14px] text-ink-muted">{s.observation.steps_used}</td>
                      <td className="px-3 py-2.5">
                        <span className="block font-mono text-[14px] text-ink">{String(s.action?.action ?? "?")}</span>
                        <span className="mt-0.5 block font-mono text-[13px] break-all text-ink-muted">{args(s.action)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[14px] text-ink-secondary">
                        <span className={s.observation.ok ? "" : "text-finding"}>{summary(s, t)}</span>
                        <details className="mt-1">
                          <summary className="hit relative w-fit cursor-pointer text-[13px] text-ink-muted">{t("run.observation")}</summary>
                          <pre className="mt-1.5 max-h-56 overflow-auto rounded-control bg-paper-sunken p-2 font-mono text-[13px] leading-relaxed text-ink-secondary">
                            {JSON.stringify(s.observation, null, 2)}
                          </pre>
                        </details>
                      </td>
                      <td className="num px-4 py-2.5 text-right text-[14px] text-ink-secondary">{s.observation.steps_remaining}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-line p-4">
            <label className="block text-[13px] text-ink-muted" htmlFor="manual-action">
              {t("live.manual")}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="manual-action"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy && status !== "running") void manualStep();
                }}
                className="h-10 min-w-0 flex-1 rounded-control border border-line-strong bg-paper-raised px-3 font-mono text-[13px] text-ink"
              />
              <Button onClick={() => void manualStep()} disabled={status === "running" || busy} aria-label={t("live.manual.send")} title={t("live.manual.send")}>
                <Send size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </Panel>

        <aside className="min-w-0 space-y-5 lg:col-span-4">
          <Panel>
            <Budget used={stepsUsed} />
          </Panel>
          <Panel title={t("live.state")}>
            <dl className="space-y-2 text-[14px]">
              <Leader label={t("live.episode")} value={<span className="font-mono text-[13px]">{session?.info.episode_id ?? "—"}</span>} />
              <Leader label={t("run.state.used")} value={stepsUsed} />
              <Leader label={t("run.state.left")} value={100 - stepsUsed} />
              <Leader label={t("live.mode")} value={t(`live.mode.${session?.info.mode ?? mode}`)} />
              <Leader label={t("live.reward")} value={finished ? (mode === "closed" ? t("live.reward.hidden") : last!.reward.toFixed(3)) : "—"} />
              <Leader label={t("live.ending")} value={finished ? (last!.terminated ? "terminated" : "truncated") : "—"} />
            </dl>
          </Panel>

          <Panel title={t("live.truth")} meta={truth ? truth.issues.length : undefined}>
            {!finished ? (
              <p className="text-[14px] text-ink-secondary">{t("live.truth.locked")}</p>
            ) : !truth ? (
              <p className="text-[14px] text-ink-muted">…</p>
            ) : truth.issues.length === 0 ? (
              <p className="text-[14px] text-ink-secondary">{t("live.truth.clean")}</p>
            ) : (
              <div className="space-y-3">
                {truth.issues.map((issue) => (
                  <div key={issue.issue_id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-ink">{typeLabel(t, issue.type)}</span>
                      <span className="font-mono text-[14px] text-ink">{money(issue.expected_amount_minor, issue.currency)}</span>
                    </div>
                    <p className="mt-1 font-mono text-[13px] break-all text-ink-muted">{issue.affected_ids.join(", ")}</p>
                    <p className="mt-0.5 font-mono text-[13px] break-all text-evidence">{issue.evidence_sets[0]?.join(", ")}</p>
                  </div>
                ))}
              </div>
            )}
            {truth?.evaluation ? (
              <p className="num mt-3 rounded-control bg-paper-sunken px-3 py-2 text-[13px] text-ink">
                {t("live.evaluator")}: {JSON.stringify(pick(truth.evaluation))}
              </p>
            ) : null}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function pick(ev: Record<string, unknown>) {
  const keys = ["reward", "f1", "tp", "fp", "fn", "inspection_steps", "malformed", "truncated_reason", "scored"];
  return Object.fromEntries(keys.filter((k) => k in ev).map((k) => [k, ev[k]]));
}

function args(a: Record<string, unknown> | undefined): string {
  if (!a || typeof a !== "object") return "";
  return Object.entries(a)
    .filter(([k]) => k !== "action")
    .map(([k, v]) => `${k}=${typeof v === "object" ? (Array.isArray((v as { findings?: unknown[] })?.findings) ? `[${(v as { findings: unknown[] }).findings.length}]` : "{…}") : String(v)}`)
    .join(" ");
}

function summary(step: LiveStep, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const o = step.observation;
  if (!o.ok) return `${o.error?.code}: ${o.error?.message}`;
  const r = o.result as Record<string, unknown> | null;
  if (!r) return "—";
  if (Array.isArray(r.rows)) return t("run.result.rows", { n: r.rows.length, cursor: r.next_cursor ? String(r.next_cursor).slice(0, 10) + "…" : "—" });
  if (r.record && typeof r.record === "object") {
    const rec = r.record as Record<string, unknown>;
    return String(rec.row_id ?? rec.invoice_id ?? rec.payment_id ?? rec.fx_key ?? "record");
  }
  if (r.document && typeof r.document === "object") {
    const d = r.document as Record<string, unknown>;
    const amount = Number(d.total_minor ?? d.amount_minor);
    return `${String(d.invoice_id ?? d.payment_id)} · ${money(amount, String(d.currency))}`;
  }
  if (typeof r.value === "string") return `= ${r.value}`;
  if (r.submitted) return t("run.result.submitted", { n: Number(r.findings) });
  return t("run.result.record");
}
