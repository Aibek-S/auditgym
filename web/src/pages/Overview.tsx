import { useState } from "react";
import { GraduationCap, BookOpen, X } from "lucide-react";
import { ButtonLink } from "../components/ui/Button";
import { Link } from "react-router-dom";
import { useDemo, useTruthHash } from "../lib/data";
import { useT } from "../lib/i18n";
import { date, dateTime, money, rewardLabel, signed } from "../lib/format";
import { accountName, episodeLabel, ISSUE_TYPES, typeLabel } from "../lib/labels";
import { guidedRun, runMarks, runPoints } from "../lib/runs";
import { interp } from "../lib/interp";
import type { Episode, Invoice } from "../lib/types";
import { PageHeader } from "../components/ui/PageHeader";
import { Leader, Panel } from "../components/ui/Panel";
import { ArchiveTable } from "../components/overview/ArchiveTable";
import { TypeBadge } from "../components/ui/TypeBadge";
import { Stamp } from "../components/ui/Stamp";
import { Marks, MarksLegend } from "../components/ui/Isotype";
import { Scatter } from "../components/ui/Scatter";
import { Scrub } from "../components/ui/Scrub";

// Order and widths from the brief: archive, dataset, reward contract, error mix, featured case,
// isotype, provenance, run scatter. Widths come from one module: 1×1 = 3 columns, 1×2 = 6, 1×4 = 12.
export function Overview() {
  const data = useDemo();
  const { t } = useT();
  const featured = data.episodes.find((e) => e.key === "duplicate") ?? data.episodes.find((e) => e.featured) ?? data.episodes[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("overview.title")}
        description={t("overview.lead", { episodes: data.stats.episodes, issues: data.stats.issues, documents: data.stats.documents })}
      />

      <Welcome />

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel title={t("overview.archive")} meta={t("overview.archive.meta")} className="animate-rise min-w-0 lg:col-span-12" bodyClassName="">
          <ArchiveTable episodes={data.episodes} />
        </Panel>

        <Panel title={t("overview.dataset")} className="lg:col-span-3">
          <dl className="space-y-2.5 text-[14px]">
            <Leader label={t("overview.dataset.company")} value={data.company.name} />
            <Leader label={t("overview.dataset.currency")} value="KZT · +05:00" />
            <Leader label={t("overview.dataset.documents")} value={data.stats.documents} />
            <Leader label={t("overview.dataset.episodes")} value={data.stats.episodes} />
            <Leader label={t("overview.dataset.clean")} value={data.stats.clean} />
          </dl>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-secondary">{t("overview.dataset.model")}</p>
        </Panel>

        <RewardContract />

        <Panel title={t("overview.mix")} meta={t("overview.mix.meta", { n: data.stats.issues })} className="lg:col-span-3">
          <ErrorMix />
        </Panel>

        <FeaturedCase episode={featured} />

        <Panel title={t("overview.isotype")} className="lg:col-span-6">
          <ArchiveIsotype />
        </Panel>

        <Panel title={t("overview.provenance")} className="lg:col-span-6">
          <Provenance />
        </Panel>

        <Panel title={t("overview.scatter")} meta={t("overview.scatter.meta")} className="lg:col-span-12">
          <Scatter points={runPoints(data, t)} />
        </Panel>
      </div>
    </div>
  );
}

function RewardContract() {
  const { t } = useT();
  const [f1, setF1] = useState(1);
  const [steps, setSteps] = useState(40);
  const r = Math.max(-1, Math.min(1, 2 * f1 - 1 - 0.002 * steps));

  return (
    <Panel title={t("overview.reward")} className="lg:col-span-6">
      <p className="num rounded-control bg-paper-sunken px-4 py-3 text-[15px] text-ink">R = clip(2·F1 − 1 − 0.002·S, −1, 1)</p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        {interp(t("reward.sentence"), {
          f1: <Scrub value={f1} onChange={setF1} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} label="F1" />,
          s: <Scrub value={steps} onChange={setSteps} min={0} max={100} step={1} label={t("reward.steps.label")} pxPerStep={4} />,
          r: <strong className="num font-medium">{rewardLabel(r)}</strong>,
        })}
      </p>
      <p className="mt-2 text-[13px] text-ink-muted">{t("reward.scrub.hint")}</p>
      <dl className="mt-4 space-y-2 text-[14px]">
        <Leader label={t("reward.case.perfect")} value="0.920" />
        <Leader label={t("reward.case.clean")} value="0.980" />
        <Leader label={t("reward.case.false")} value={<span className="text-finding">−1.000</span>} />
      </dl>
      <p className="mt-4 text-[14px] text-ink-secondary">
        {t("reward.steps.note")}{" "}
        <Link to="/console/method" className="link">
          {t("reward.more")}
        </Link>
      </p>
    </Panel>
  );
}

function ErrorMix() {
  const data = useDemo();
  const { t } = useT();
  const total = Math.max(1, data.stats.issues);
  const counts = new Map(data.stats.types.map((item) => [item.type, item.count]));
  return (
    <div className="space-y-3.5">
      {ISSUE_TYPES.map((type) => {
        const count = counts.get(type) ?? 0;
        return (
          <div key={type}>
            <div className="flex items-baseline justify-between gap-3">
              <TypeBadge type={type} />
              <span className="num text-[13px] text-ink-muted">{t("mix.of", { n: count, total })}</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-paper-sunken">
              <div className="animate-bar h-full rounded-full bg-ink-secondary" style={{ width: `${(count / total) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InvoiceSheet({ invoice, note, children }: { invoice: Invoice; note: string; children?: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="relative rounded-card border border-line-strong bg-paper p-4">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <span className="font-mono text-[14px] text-ink">{invoice.invoice_id}</span>
        <span className="num text-[13px] text-ink-muted">{date(invoice.issued_at)}</span>
      </div>
      <dl className="mt-3 space-y-1.5 text-[14px]">
        <Leader label={t("record.customer")} value={<span className="font-mono">{invoice.entity_id}</span>} />
        <Leader label={t("record.deliveryNote")} value={<span className="font-mono">{note}</span>} />
        <Leader label={t("record.total")} value={money(invoice.total_minor, invoice.currency)} />
      </dl>
      {children}
    </div>
  );
}

function FeaturedCase({ episode }: { episode: Episode }) {
  const { t } = useT();
  const issue = episode.truth.issues.find((item) => item.type === "duplicate_invoice") ?? episode.truth.issues[0];
  if (!issue) return null;
  const invoices = issue.affected_ids
    .map((id) => episode.invoices.find((inv) => inv.invoice_id === id))
    .filter((inv): inv is Invoice => Boolean(inv));
  const evidence = new Set(issue.evidence_sets.flat());
  const rows = episode.ledger.filter((row) => evidence.has(row.row_id));
  const note = invoices[0]?.line_items[0]?.delivery_note_id ?? "—";

  return (
    <Panel
      title={t("featured.title")}
      meta={episodeLabel(t, episode) === typeLabel(t, issue.type) ? episodeLabel(t, episode) : `${episodeLabel(t, episode)} · ${typeLabel(t, issue.type)}`}
      className="lg:col-span-12"
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h3 className="text-[22px] leading-snug font-medium text-ink">{t("featured.headline")}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-secondary">{t("featured.body")}</p>
          <Link to={`/console/episodes/${episode.key}?issue=${issue.issue_id}`} className="link mt-4 inline-block text-[14px]">
            {t("featured.open")}
          </Link>
        </div>
        <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:col-span-8">
          {invoices.map((invoice, index) => (
            <InvoiceSheet key={invoice.invoice_id} invoice={invoice} note={note}>
              {index === invoices.length - 1 ? (
                <div className="pointer-events-none absolute right-4 -bottom-6">
                  <Stamp tone="finding" code="D" label={t("stamp.duplicate")} date={date(invoice.issued_at)} id={issue.issue_id} animate delay={300} />
                </div>
              ) : null}
            </InvoiceSheet>
          ))}
          <div className="sm:col-span-2">
            <p className="text-[13px] text-ink-muted">{t("featured.ledger")}</p>
            <dl className="mt-2 space-y-1.5 text-[14px]">
              {rows.map((row) => (
                <Leader
                  key={row.row_id}
                  label={
                    <span>
                      <span className="font-mono text-ink-muted">{row.row_id}</span> {accountName(t, row.account, episode.accounts[row.account])}
                    </span>
                  }
                  value={signed(row.debit_minor - row.credit_minor)}
                />
              ))}
            </dl>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ArchiveIsotype() {
  const data = useDemo();
  const { t } = useT();
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-ink-secondary">{t("isotype.lead")}</p>
      <dl className="space-y-2.5 text-[14px]">
        {data.episodes.map((episode) => {
          const run = guidedRun(episode);
          return (
            <div key={episode.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line pb-2.5 last:border-0">
              <dt className="truncate">
                <Link to={`/console/episodes/${episode.key}`} className="link">
                  {episodeLabel(t, episode)}
                </Link>
              </dt>
              <dd className="m-0">
                {run && episode.truth.issues.length ? (
                  <Marks marks={runMarks(episode, run, t)} />
                ) : (
                  <span className="text-[13px] text-ink-muted">{t("archive.clean")}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <MarksLegend />
    </div>
  );
}

function HashRow({ episode }: { episode: Episode }) {
  const { t } = useT();
  const hash = useTruthHash(episode);
  return <Leader label={episodeLabel(t, episode)} value={<span className="font-mono text-[13px]">{hash ? hash.slice(0, 16) : "…"}</span>} />;
}

function Provenance() {
  const data = useDemo();
  const { t } = useT();
  const seeds = data.episodes.filter((e) => e.seed !== null).map((e) => e.seed);
  return (
    <div className="space-y-4 text-[14px]">
      <dl className="space-y-2">
        <Leader label={t("prov.exported")} value={dateTime(data.generated_at)} />
        <Leader label={t("prov.script")} value={<span className="font-mono text-[13px]">web/scripts/export_demo.py</span>} />
        <Leader label={t("prov.fixtures")} value={data.episodes.filter((e) => e.source === "fixture").length} />
        <Leader label={t("prov.seeds")} value={seeds.join(", ")} />
        <Leader label={t("prov.schema")} value={data.episodes[0]?.manifest.schema_version ?? "—"} />
      </dl>
      <div>
        <p className="text-[13px] text-ink-muted">{t("prov.hashes")}</p>
        <dl className="mt-2 space-y-1.5">
          {data.episodes.map((episode) => (
            <HashRow key={episode.key} episode={episode} />
          ))}
        </dl>
      </div>
    </div>
  );
}

/** First visit: two ways in, the tour and the guide. Hidden for good once dismissed or the tour is done. */
function Welcome() {
  const { t } = useT();
  const seen = () => {
    try {
      return localStorage.getItem("auditgym.welcome") === "hidden" || localStorage.getItem("auditgym.tour") === "done";
    } catch {
      return false;
    }
  };
  const [hidden, setHidden] = useState(seen);
  if (hidden) return null;
  const hide = () => {
    try {
      localStorage.setItem("auditgym.welcome", "hidden");
    } catch {
      /* storage blocked: hidden for this visit */
    }
    setHidden(true);
  };
  return (
    <section aria-labelledby="welcome-h" className="animate-rise relative rounded-card border border-ink bg-paper-raised p-5 sm:p-6">
      <button type="button" onClick={hide} aria-label={t("welcome.hide")} title={t("welcome.hide")} className="hit absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-control text-ink-muted hover:text-ink">
        <X size={18} aria-hidden="true" />
      </button>
      <h2 id="welcome-h" className="text-[22px] font-medium text-ink">
        {t("welcome.title")}
      </h2>
      <p className="mt-2 max-w-[62ch] text-[17px] leading-relaxed text-ink-secondary">{t("welcome.body")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink to="/console/practice?tour=1" variant="primary" className="!h-12 px-5 text-[16px]">
          <GraduationCap size={18} aria-hidden="true" /> {t("welcome.tour")}
        </ButtonLink>
        <ButtonLink to="/console/guide" className="!h-12 px-5 text-[16px]">
          <BookOpen size={18} aria-hidden="true" /> {t("welcome.guide")}
        </ButtonLink>
      </div>
    </section>
  );
}
