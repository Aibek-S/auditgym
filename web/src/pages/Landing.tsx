import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  Lock,
} from "lucide-react";
import { useDemo } from "../lib/data";
import type { Episode, Invoice } from "../lib/types";
import { accountLabel, dateShort, money, rewardLabel, TYPE_NOTES } from "../lib/format";
import { BrandMark } from "../components/BrandMark";
import { ButtonLink } from "../components/ui/Button";
import { Stamp } from "../components/ui/Stamp";
import { TypeBadge } from "../components/ui/TypeBadge";

export function Landing() {
  const data = useDemo();
  const duplicate =
    data.episodes.find(
      (episode) =>
        episode.featured && episode.truth.issues.some((issue) => issue.type === "duplicate_invoice"),
    ) ?? data.episodes.find((episode) => episode.truth.issues.length > 0);

  const stats = [
    { value: data.stats.episodes, label: "episodes" },
    { value: data.stats.issues, label: "planted issues" },
    { value: data.stats.documents, label: "documents" },
    { value: 100, label: "step budget" },
  ];
  const example = duplicate ? findingExample(duplicate) : null;

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/92 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6">
          <BrandMark to="/" subtitle="research preview" />
          <nav className="hidden items-center gap-6 text-[12px] md:flex" aria-label="Landing">
            <Link to="/console" className="text-ink-secondary no-underline transition-colors hover:text-ink">
              Console
            </Link>
            <Link to="/method" className="text-ink-secondary no-underline transition-colors hover:text-ink">
              Method
            </Link>
            <a
              href="https://github.com/Aibek-S/auditgym"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-ink-secondary no-underline transition-colors hover:text-ink"
            >
              GitHub
              <ArrowUpRight size={12} strokeWidth={1.5} />
            </a>
          </nav>
          <ButtonLink to="/console" variant="primary" size="sm">
            Open console
            <ArrowRight size={13} strokeWidth={1.5} />
          </ButtonLink>
        </div>
      </header>

      <main>
        <section className="border-b border-line">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
            <div className="animate-rise">
              <p className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-verified" aria-hidden="true" />
                Audit RL environment · FinTech case 2026
              </p>
              <h1 className="mt-5 max-w-[12ch] text-[42px] leading-[1.02] font-medium tracking-[-0.035em] text-ink sm:text-[58px]">
                An audit gym for models that read the books
              </h1>
              <p className="mt-6 max-w-lg text-[14px] leading-relaxed text-ink-secondary">
                Synthetic company-months with planted accounting errors, a narrow read-only tool
                interface, and a matcher that scores findings against hidden causal truth.
              </p>
              <p className="mt-3 max-w-lg text-[12px] leading-relaxed text-ink-muted">
                The agent never sees the answers. The console is where you do.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-2.5">
                <ButtonLink to="/console" variant="primary">
                  Open the console
                  <ArrowRight size={14} strokeWidth={1.5} />
                </ButtonLink>
                <ButtonLink to="/method" variant="secondary">
                  Read the method
                </ButtonLink>
              </div>

              <dl className="mt-10 grid max-w-lg grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="border-t border-line-strong pt-3">
                    <dt className="text-[11px] text-ink-muted">{stat.label}</dt>
                    <dd className="num mt-1 text-[22px] leading-none font-medium text-ink">
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {duplicate ? <Specimen episode={duplicate} /> : null}
          </div>
        </section>

        <section className="border-b border-line">
          <div className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[11px] text-ink-muted">
                  The loop
                </p>
                <h2 className="mt-2 text-[28px] font-medium tracking-[-0.025em] text-ink">
                  Read, act, score
                </h2>
              </div>
              <p className="max-w-sm text-[12px] leading-relaxed text-ink-secondary">
                One episode is one company-month. The loop is deliberately small so the evaluator
                can be strict about what counts as evidence.
              </p>
            </div>

            <div className="mt-9 grid divide-y divide-line border-y border-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              <LoopCell
                index="01"
                title="Read the month"
                body="Six public files, one company-month. Stable cursors and a 50-row page keep the interface predictable."
                footer="manifest · ledger · invoices · payments · fx · policy"
              />
              <LoopCell
                index="02"
                title="Work the evidence"
                body="List, open, follow documents and calculate. Submit once the finding is complete. The budget is 100 steps."
                footer="list_records · get_record · get_document · calculator · submit"
              />
              <LoopCell
                index="03"
                title="Take the score"
                body="The matcher compares findings with hidden truth. Precision, recall and step cost decide the reward."
                footer="R = clip(2·F1 − 1 − 0.002·S, −1, 1)"
              />
            </div>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="font-mono text-[11px] text-ink-muted">
                The matcher
              </p>
              <h2 className="mt-2 text-[28px] font-medium tracking-[-0.025em] text-ink">
                Evidence, not labels
              </h2>
              <p className="mt-4 max-w-md text-[13px] leading-relaxed text-ink-secondary">
                A finding is a type, a set of affected ids, an amount and an evidence set that
                resolves to public records. The matcher accepts any listed evidence set, so there is
                more than one honest path through the books.
              </p>
              <p className="mt-3 max-w-md text-[12px] leading-relaxed text-ink-muted">
                A clean month rewards silence. One false finding on a clean month scores −1.000.
              </p>
              <Link
                to="/method"
                className="mt-5 relative hit inline-flex items-center gap-1.5 text-[12px] font-medium text-accent no-underline transition-colors hover:text-accent-ink"
              >
                Read the scoring contract
                <ArrowRight size={13} strokeWidth={1.5} />
              </Link>
            </div>

            <div className="min-w-0 rounded-card border border-line bg-paper-sunken/60 p-4">
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <span className="font-mono text-[11px] text-ink-muted">Submitted finding</span>
                <span className="font-mono text-[11px] text-ink-muted">{example?.id}</span>
              </div>
              <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-[1.8] text-ink">
                {example?.json}
              </pre>
              <p className="mt-4 border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-muted">
                Match on type, ids, amount within 100 minor units, and a full evidence set.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[11px] text-ink-muted">
                  Error classes
                </p>
                <h2 className="mt-2 text-[28px] font-medium tracking-[-0.025em] text-ink">
                  Four ways a month goes wrong
                </h2>
              </div>
              <p className="max-w-sm text-[12px] leading-relaxed text-ink-secondary">
                Fixtures pin the format; generated episodes vary names, ids, amounts and error
                combinations from a seed.
              </p>
            </div>

            <div className="mt-9 grid border-t border-line sm:grid-cols-2">
              {data.stats.types.map((item, index) => (
                <div
                  key={item.type}
                  className={`border-b border-line py-5 sm:px-5 ${
                    index % 2 === 0 ? "sm:border-r" : ""
                  } ${index < 2 ? "sm:border-b" : "sm:border-b-0"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <TypeBadge type={item.type} />
                    <span className="num text-[11px] text-ink-muted">{item.count} episodes</span>
                  </div>
                  <p className="mt-2 max-w-md text-[12px] leading-relaxed text-ink-secondary">
                    {TYPE_NOTES[item.type]}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-5 max-w-2xl text-[11px] leading-relaxed text-ink-muted">
              Scenarios I1 and I2 combine two errors in the same month so one evidence chain can
              implicate more than one finding.
            </p>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="font-mono text-[11px] text-ink-muted">
                  Build state
                </p>
                <h2 className="mt-2 text-[28px] font-medium tracking-[-0.025em] text-ink">
                  Built, and still building
                </h2>
                <p className="mt-4 max-w-sm text-[12px] leading-relaxed text-ink-secondary">
                  The console does not invent policy numbers. Guided replays open real public records
                  and submit recorded truth; baseline scores wait for the runner.
                </p>
                <a
                  href="https://github.com/Aibek-S/auditgym"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 relative hit inline-flex items-center gap-1.5 text-[12px] font-medium text-accent no-underline transition-colors hover:text-accent-ink"
                >
                  Repository and docs
                  <ArrowUpRight size={13} strokeWidth={1.5} />
                </a>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-card border border-line bg-paper-raised p-4">
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-verified-soft text-verified">
                      <Check size={11} strokeWidth={2} />
                    </span>
                    <p className="text-[11px] font-medium text-ink">Working now</p>
                  </div>
                  <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-ink-secondary">
                    <li>Episode generator with fixed seeds</li>
                    <li>Four error classes and I1/I2 interactions</li>
                    <li>Invariant checks and episode validation</li>
                    <li>Deterministic demo archive and this console</li>
                  </ul>
                </div>
                <div className="rounded-card border border-line bg-paper-raised p-4">
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-warning-soft text-warning">
                      <Clock3 size={11} strokeWidth={2} />
                    </span>
                    <p className="text-[11px] font-medium text-ink">In progress</p>
                  </div>
                  <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-ink-secondary">
                    <li>Environment step loop</li>
                    <li>Matcher and reward contract</li>
                    <li>Runner and trajectory logs</li>
                    <li>Published baseline policies</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6">
          <div className="relative overflow-hidden rounded-panel border border-ink bg-ink px-6 py-10 sm:px-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-mono text-[11px] text-paper/50">
                  The archive is open
                </p>
                <h2 className="mt-3 max-w-lg text-[32px] leading-[1.1] font-medium tracking-[-0.03em] text-paper">
                  Follow one month from invoice to evidence to score
                </h2>
                <p className="mt-3 max-w-md text-[12px] leading-relaxed text-paper/60">
                  {data.stats.episodes} episodes, one workbench, no write access. Reveal the truth
                  when you are ready to compare.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  to="/console"
                  className="hit relative inline-flex h-10 items-center gap-2 rounded-control bg-paper px-5 text-[13px] font-medium text-ink no-underline transition-[background-color,transform] duration-[120ms] ease-out hover:bg-paper-sunken active:scale-[0.98]"
                >
                  Open the console
                  <ArrowRight size={14} strokeWidth={1.5} />
                </Link>
                <a
                  href="https://github.com/Aibek-S/auditgym"
                  target="_blank"
                  rel="noreferrer"
                  className="hit relative inline-flex h-10 items-center gap-2 rounded-control border border-paper/25 px-5 text-[13px] font-medium text-paper no-underline transition-[background-color,transform] duration-[120ms] ease-out hover:bg-paper/10 active:scale-[0.98]"
                >
                  GitHub
                  <ArrowUpRight size={14} strokeWidth={1.5} />
                </a>
              </div>
            </div>
            <div className="mt-8 flex items-center gap-2 border-t border-paper/15 pt-4 font-mono text-[11px] text-paper/45">
              <Lock size={11} strokeWidth={1.5} />
              Truth stays outside the agent process
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <BrandMark to="/" subtitle="research preview" />
          <p className="text-[11px] text-ink-muted">
            FinTech case 2026 · synthetic data only · no real accounting records
          </p>
        </div>
      </footer>
    </div>
  );
}

function findingExample(episode: Episode) {
  const issue =
    episode.truth.issues.find((item) => item.type === "duplicate_invoice") ?? episode.truth.issues[0];
  if (!issue) return null;
  const quote = (value: string) => `"${value}"`;
  const json = [
    "{",
    `  "type": ${quote(issue.type)},`,
    `  "affected_ids": [${issue.affected_ids.map(quote).join(", ")}],`,
    `  "claimed_amount_minor": ${issue.expected_amount_minor},`,
    `  "currency": ${quote(issue.currency)},`,
    `  "evidence_ids": [`,
    `    ${(issue.evidence_sets[0] ?? []).map(quote).join(", ")}`,
    "  ]",
    "}",
  ].join("\n");
  return { id: issue.issue_id, json };
}

function LoopCell({
  index,
  title,
  body,
  footer,
}: {
  index: string;
  title: string;
  body: string;
  footer: string;
}) {
  return (
    <div className="py-6 lg:px-6 lg:py-7 lg:first:pl-0 lg:last:pr-0">
      <p className="font-mono text-[11px] text-ink-muted">{index}</p>
      <h3 className="mt-2 text-[17px] font-medium text-ink">{title}</h3>
      <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-ink-secondary">{body}</p>
      <p className="mt-4 font-mono text-[11px] leading-relaxed text-ink-muted">{footer}</p>
    </div>
  );
}

function Specimen({ episode }: { episode: Episode }) {
  const issue = episode.truth.issues.find((item) => item.type === "duplicate_invoice");
  if (!issue) return null;
  const change = episode.truth.provenance.changes.find((item) => item.issue_id === issue.issue_id);
  const after = (change?.after ?? {}) as Record<string, string>;
  const deliveryNote = after.delivery_note_id;
  const invoices = issue.affected_ids
    .map((id) => episode.invoices.find((invoice) => invoice.invoice_id === id))
    .filter((invoice): invoice is Invoice => Boolean(invoice));
  const ledgerRows = episode.ledger
    .filter((row) => issue.evidence_sets.flat().includes(row.row_id))
    .slice(0, 2);
  const score = episode.summary.guided_score;

  return (
    <div className="relative animate-rise" style={{ animationDelay: "90ms" }}>
      <div
        className="absolute inset-0 translate-x-2 translate-y-2 rounded-card border border-line bg-paper-sunken/60"
        aria-hidden="true"
      />
      <div className="relative overflow-hidden rounded-card border border-line bg-paper-raised">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <span className="font-mono text-[11px] text-ink-muted">
            Episode · {episode.manifest.period_start.slice(0, 7)}
          </span>
          <Stamp tone="finding" animate delay={480}>
            Finding
          </Stamp>
        </div>
        <div className="p-4">
          <p className="font-mono text-[11px] text-ink-muted">{issue.type}</p>
          <h2 className="mt-1 text-[21px] font-medium tracking-[-0.02em] text-ink">
            Two invoices, one delivery
          </h2>

          <div className="mt-4 overflow-hidden rounded-control border border-line">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-line bg-paper-sunken/60 px-2.5 py-1.5 text-[11px] text-ink-muted">
              <span>Invoice</span>
              <span>Issued</span>
              <span className="text-right">Total</span>
            </div>
            {invoices.map((invoice) => (
              <div
                key={invoice.invoice_id}
                className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 border-b border-line/60 px-2.5 py-2 last:border-0"
              >
                <span className="font-mono text-[11px] text-ink">{invoice.invoice_id}</span>
                <span className="text-[11px] text-ink-muted">{dateShort(invoice.issued_at)}</span>
                <span className="num text-right text-[11px] text-ink">
                  {money(invoice.total_minor)}
                </span>
              </div>
            ))}
          </div>

          {deliveryNote ? (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-[1px] bg-finding" aria-hidden="true" />
              shared delivery note
              <span className="font-mono text-ink">{deliveryNote}</span>
            </div>
          ) : null}

          <div className="mt-3 space-y-1.5 border-t border-line pt-2.5">
            {ledgerRows.map((row) => (
              <div key={row.row_id} className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[11px] text-ink-muted">
                  {row.row_id} · {accountLabel(episode.accounts, row.account)}
                </span>
                <span className="num text-[11px] text-ink">
                  {row.debit_minor
                    ? `Dr ${money(row.debit_minor)}`
                    : `Cr ${money(row.credit_minor)}`}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            No reversing credit note. Both lines reach revenue.
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-line bg-paper-sunken/50 px-4 py-2.5">
          <Link
            to={`/console/episodes/${episode.key}`}
            className="relative hit inline-flex items-center gap-1 text-[11px] font-medium text-accent no-underline hover:text-accent-ink"
          >
            Open this episode
            <ArrowRight size={11} strokeWidth={1.5} />
          </Link>
          <span className="font-mono text-[11px] text-ink-muted">
            {score.inspection_steps} steps · R {rewardLabel(score.reward)}
          </span>
        </div>
      </div>
    </div>
  );
}
