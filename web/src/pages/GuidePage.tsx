import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useDemo } from "../lib/data";
import { useT } from "../lib/i18n";
import { amount, date, dateTime, money } from "../lib/format";
import { accountName, episodeLabel, ISSUE_TYPES, typeLabel, typeNote } from "../lib/labels";
import type { Episode, IssueType, TruthIssue } from "../lib/types";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { ButtonLink } from "../components/ui/Button";
import { TypeMark } from "../components/ui/TypeBadge";
import { Term, TERMS } from "../components/ui/Term";

/** "How to read an episode": the tables, the four errors and the score, each with a real record. */
export function GuidePage() {
  const data = useDemo();
  const { t } = useT();
  const location = useLocation();
  const ep = data.episodes.find((e) => e.key === "duplicate") ?? data.episodes[0];

  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    el?.scrollIntoView({ block: "start" });
    el?.focus({ preventScroll: true });
  }, [location.hash]);

  // a real sale: the revenue line (4000) and the receivable line (1200) booked together
  const revenue = ep.ledger.find((r) => r.account === "4000" && r.credit_minor > 0 && r.invoice_id);
  const sale = revenue ? ep.ledger.find((r) => r.account === "1200" && r.invoice_id === revenue.invoice_id && r.timestamp === revenue.timestamp) : undefined;
  const saleRows = sale && revenue ? [sale, revenue] : [];
  const invoice = ep.invoices.find((i) => i.invoice_id === sale?.invoice_id) ?? ep.invoices[0];
  const payment = ep.payments.find((p) => p.invoice_refs?.length) ?? ep.payments[0];
  const fx = ep.fx.find((r) => r.source_currency === "USD") ?? ep.fx[0];
  const examples = ISSUE_TYPES.map((type) => findExample(data.episodes, type)).filter(Boolean) as { episode: Episode; issue: TruthIssue }[];

  const sections = [
    ["guide-episode", t("guide.episode.title")],
    ["guide-tables", t("guide.tables.title")],
    ["guide-errors", t("guide.errors.title")],
    ["guide-reward", t("guide.reward.title")],
    ["guide-glossary", t("guide.glossary.title")],
  ];

  return (
    <div className="space-y-6 text-[16px] leading-relaxed">
      <PageHeader
        title={t("guide.title")}
        description={t("guide.lede")}
        actions={
          <ButtonLink to="/console/practice?tour=1" variant="primary" className="!h-11 text-[15px]">
            <GraduationCap size={16} aria-hidden="true" /> {t("welcome.tour")}
          </ButtonLink>
        }
      />

      <nav aria-label={t("guide.toc")} className="flex flex-wrap gap-2">
        {sections.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="link rounded-control border border-line px-3 py-2 text-[15px] no-underline hover:border-ink">
            {label}
          </a>
        ))}
      </nav>

      <section id="guide-episode" tabIndex={-1} className="scroll-mt-24 outline-none">
        <Panel title={t("guide.episode.title")}>
          <p className="max-w-[70ch] text-ink-secondary">{t("guide.episode.body", { company: data.company.name.replace(/\.$/, "") })}</p>
        </Panel>
      </section>

      <section id="guide-tables" tabIndex={-1} className="scroll-mt-24 space-y-4 outline-none">
        <h2 className="text-[20px] font-medium text-ink">{t("guide.tables.title")}</h2>
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title={<Term k="ledger" />} meta={t("guide.example", { name: episodeLabel(t, ep) })}>
            <p className="text-ink-secondary">{t("guide.ledger.body")}</p>
            <table className="mt-3 w-full border-collapse text-[14px]">
              <tbody>
                {saleRows.map((r) => (
                  <tr key={r.row_id} className="border-b border-line last:border-0">
                    <td className="num py-2 pr-3 text-ink-muted">{dateTime(r.timestamp)}</td>
                    <td className="py-2 pr-3 text-ink">
                      <span className="num text-ink-muted">{r.account}</span> {accountName(t, r.account)}
                    </td>
                    <td className="num py-2 text-right text-ink">
                      {r.debit_minor ? `${t("practice.col.debit")} ${amount(r.debit_minor)}` : `${t("practice.col.credit")} ${amount(r.credit_minor)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[14px] text-ink-muted">
              <Term k="debit_credit" />
            </p>
          </Panel>

          <Panel title={<Term k="invoice" />} meta={t("guide.example", { name: episodeLabel(t, ep) })}>
            <p className="text-ink-secondary">{t("guide.invoice.body")}</p>
            <p className="mt-3 font-mono text-[14px] text-ink">
              {invoice.invoice_id} · {dateTime(invoice.issued_at)} · {money(invoice.total_minor, invoice.currency)}
            </p>
            <ul className="mt-2 space-y-1.5 text-[14px]">
              {invoice.line_items.slice(0, 3).map((li) => (
                <li key={li.line_no} className="flex flex-wrap justify-between gap-2 border-b border-line pb-1.5 last:border-0">
                  <span className="text-ink">
                    {li.description} <span className="num text-ink-muted">× {li.quantity}</span>
                  </span>
                  <span className="rounded-control bg-evidence-soft px-1.5 font-mono text-evidence">
                    <Term k="delivery_note">{li.delivery_note_id}</Term>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={<Term k="payment" />} meta={t("guide.example", { name: episodeLabel(t, ep) })}>
            <p className="text-ink-secondary">{t("guide.payment.body")}</p>
            <p className="mt-3 font-mono text-[14px] text-ink">
              {payment.payment_id} · {dateTime(payment.timestamp)} · {money(payment.amount_minor, payment.currency)}
            </p>
            <p className="mt-1 text-[14px] text-ink-secondary">
              {t("practice.col.refs")}: <span className="font-mono">{payment.invoice_refs?.join(", ") ?? t("practice.norefs")}</span>
            </p>
          </Panel>

          <Panel title={<Term k="fx" />} meta={t("guide.example", { name: episodeLabel(t, ep) })}>
            <p className="text-ink-secondary">{t("guide.fx.body")}</p>
            {fx ? (
              <p className="num mt-3 text-[15px] text-ink">
                {date(fx.date)} · 1 {fx.source_currency} = {fx.rate} KZT
              </p>
            ) : null}
          </Panel>
        </div>
      </section>

      <section id="guide-errors" tabIndex={-1} className="scroll-mt-24 space-y-4 outline-none">
        <h2 className="text-[20px] font-medium text-ink">{t("guide.errors.title")}</h2>
        <p className="max-w-[70ch] text-ink-secondary">{t("guide.errors.body")}</p>
        <div className="grid gap-5 lg:grid-cols-2">
          {examples.map(({ episode, issue }) => (
            <Panel
              key={issue.type}
              title={
                <span className="flex items-center gap-2">
                  <TypeMark type={issue.type} /> {typeLabel(t, issue.type)}
                </span>
              }
              meta={t("guide.example", { name: episodeLabel(t, episode) })}
            >
              <p className="text-ink-secondary">{typeNote(t, issue.type)}</p>
              <dl className="mt-3 space-y-1.5 text-[15px]">
                <div className="leader">
                  <dt className="text-ink-secondary">
                    <Term k="affected">{t("guide.error.affected")}</Term>
                  </dt>
                  <dd className="m-0 text-right font-mono text-[14px] break-all text-ink">{issue.affected_ids.join(", ")}</dd>
                </div>
                <div className="leader">
                  <dt className="text-ink-secondary">{t("guide.error.amount")}</dt>
                  <dd className="num m-0 text-right text-ink">{money(issue.expected_amount_minor, issue.currency)}</dd>
                </div>
                <div className="leader">
                  <dt className="text-ink-secondary">
                    <Term k="evidence">{t("guide.error.evidence")}</Term>
                  </dt>
                  <dd className="m-0 text-right font-mono text-[14px] break-all text-evidence">{issue.evidence_sets[0]?.join(", ")}</dd>
                </div>
              </dl>
              <ButtonLink to={`/console/episodes/${episode.key}?truth=1&issue=${issue.issue_id}`} className="mt-4 !h-11 text-[15px]">
                {t("guide.error.open")}
              </ButtonLink>
            </Panel>
          ))}
        </div>
      </section>

      <section id="guide-reward" tabIndex={-1} className="scroll-mt-24 outline-none">
        <Panel title={t("guide.reward.title")}>
          <p className="max-w-[70ch] text-ink-secondary">{t("guide.reward.body")}</p>
          <p className="num mt-3 rounded-control bg-paper-sunken px-4 py-3 text-[17px] text-ink">{t("guide.reward.example")}</p>
        </Panel>
      </section>

      <section id="guide-glossary" tabIndex={-1} className="scroll-mt-24 outline-none">
        <Panel title={t("guide.glossary.title")}>
          <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            {TERMS.map((k) => (
              <div key={k} id={`term-${k}`} tabIndex={-1} className="scroll-mt-24 rounded-control outline-none focus:bg-evidence-soft">
                <dt className="font-medium text-ink">{t(`term.${k}.name`)}</dt>
                <dd className="m-0 mt-0.5 text-ink-secondary">{t(`term.${k}.def`)}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </section>

      <ButtonLink to="/console/practice" variant="primary" className="!h-12 text-[16px]">
        {t("guide.cta")}
      </ButtonLink>
    </div>
  );
}

function findExample(episodes: Episode[], type: IssueType): { episode: Episode; issue: TruthIssue } | null {
  for (const episode of episodes) {
    const issue = episode.truth.issues.find((i) => i.type === type);
    if (issue) return { episode, issue };
  }
  return null;
}
