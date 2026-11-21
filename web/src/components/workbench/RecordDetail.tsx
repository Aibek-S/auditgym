import type { ReactNode } from "react";
import type { Episode, FxRow, Invoice, LedgerRow, Payment, TruthIssue } from "../../lib/types";
import { useT } from "../../lib/i18n";
import { amount, date, dateTime, money, signed } from "../../lib/format";
import { accountName, policyLabel, tableLabel, typeLabel } from "../../lib/labels";
import {
  deliveryNotes,
  fxKey,
  invoiceCash,
  issuesForRecord,
  linkedInvoices,
  linkedLedger,
  linkedPayments,
  paymentSplit,
  recordTruthState,
  refFromRawId,
  sharedDeliveryInvoices,
  type AnyRecord,
  type RecordRef,
  type TableName,
  type TruthMarks,
} from "../../lib/records";
import { changesFor, cleanLedgerValue, fxCheck } from "../../lib/truth";
import { Leader } from "../ui/Panel";
import { Stamp } from "../ui/Stamp";
import { TypeBadge } from "../ui/TypeBadge";

// Record detail: numbered fields with dot leaders (after IRS 1040 line codes), status written over the
// document (after the 1901 "Paid" invoice), the FX conversion as an equation (after TallyPrime).

function RefLink({ episode, raw, onOpen }: { episode: Episode; raw: string; onOpen: (ref: RecordRef) => void }) {
  const ref = refFromRawId(episode, raw);
  if (!ref) return <span className="font-mono text-[13px] text-ink-muted">{raw}</span>;
  return (
    <button type="button" onClick={() => onOpen(ref)} className="link hit relative font-mono text-[13px]">
      {raw}
    </button>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <h3 className="text-[13px] font-medium text-ink-muted">{title}</h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Fields({ children }: { children: ReactNode }) {
  return <dl className="space-y-2 text-[14px]">{children}</dl>;
}

export function RecordDetail({
  episode,
  selected,
  truthOn,
  marks,
  onOpen,
  onClose,
}: {
  episode: Episode;
  selected: RecordRef;
  truthOn: boolean;
  marks: TruthMarks;
  onOpen: (ref: RecordRef) => void;
  onClose?: () => void;
}) {
  const { t } = useT();
  const record = findRecord(episode, selected);
  if (!record) return <p className="p-5 text-[14px] text-ink-muted">{t("record.missing")}</p>;

  const lens = truthOn ? recordTruthState(marks, selected.table, record) : null;
  const issues = truthOn ? issuesForRecord(episode, selected.table, record) : [];

  return (
    <article aria-labelledby="record-h">
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-muted">{tableLabel(t, selected.table)}</p>
          <h2 id="record-h" className="mt-0.5 truncate font-mono text-[18px] text-ink">
            {titleOf(selected.table, record)}
          </h2>
        </div>
        <div className="flex shrink-0 items-start gap-3">
          {lens === "finding" ? <Stamp tone="finding" code="F" label={t("stamp.finding")} id={issues.map((i) => i.issue_id).join(" ")} /> : null}
          {onClose ? (
            <button type="button" onClick={onClose} className="hit relative rounded-control border border-line-strong px-3 py-1.5 text-[13px] text-ink">
              {t("record.close")}
            </button>
          ) : null}
        </div>
      </header>

      <div className="relative">
        {selected.table === "ledger" ? <LedgerFields episode={episode} row={record as LedgerRow} truthOn={truthOn} onOpen={onOpen} /> : null}
        {selected.table === "invoices" ? <InvoiceFields episode={episode} invoice={record as Invoice} onOpen={onOpen} /> : null}
        {selected.table === "payments" ? <PaymentFields episode={episode} payment={record as Payment} onOpen={onOpen} /> : null}
        {selected.table === "fx" ? <FxFields episode={episode} row={record as FxRow} /> : null}
      </div>

      <Linked episode={episode} table={selected.table} id={selected.id} onOpen={onOpen} />

      {truthOn ? <TruthBlock episode={episode} record={record} table={selected.table} issues={issues} onOpen={onOpen} /> : null}
    </article>
  );
}

function findRecord(episode: Episode, ref: RecordRef): AnyRecord | undefined {
  if (ref.table === "ledger") return episode.ledger.find((r) => r.row_id === ref.id);
  if (ref.table === "invoices") return episode.invoices.find((r) => r.invoice_id === ref.id);
  if (ref.table === "payments") return episode.payments.find((r) => r.payment_id === ref.id);
  return episode.fx.find((r) => fxKey(r) === ref.id);
}

function titleOf(table: TableName, record: AnyRecord): string {
  if (table === "ledger") return (record as LedgerRow).row_id;
  if (table === "invoices") return (record as Invoice).invoice_id;
  if (table === "payments") return (record as Payment).payment_id;
  const row = record as FxRow;
  return `${row.source_currency}/${row.target_currency}`;
}

function LedgerFields({ episode, row, truthOn, onOpen }: { episode: Episode; row: LedgerRow; truthOn: boolean; onOpen: (ref: RecordRef) => void }) {
  const { t } = useT();
  const clean = truthOn ? cleanLedgerValue(episode, row) : null;
  return (
    <div className="px-5 pb-4">
      <Fields>
        <Leader code="1" label={t("record.booked")} value={dateTime(row.timestamp)} />
        {clean?.field === "timestamp" ? <p className="text-right text-[13px] text-ink-muted">{t("lens.clean", { value: dateTime(String(clean.clean)) })}</p> : null}
        <Leader code="2" label={t("record.account")} value={`${accountName(t, row.account, episode.accounts[row.account])} ${row.account}`} />
        <Leader code="3" label={t("record.amount")} value={<span className="font-mono">{signed(row.debit_minor - row.credit_minor)}</span>} />
        {clean?.field === "amount" ? <p className="text-right text-[13px] text-ink-muted">{t("lens.clean", { value: signed(Number(clean.clean)) })}</p> : null}
        <Leader code="4" label={t("record.currency")} value={row.currency} />
        <Leader code="5" label={t("record.entity")} value={<span className="font-mono">{row.entity_id ?? "—"}</span>} />
        <Leader code="6" label={t("record.invoice")} value={row.invoice_id ? <RefLink episode={episode} raw={row.invoice_id} onOpen={onOpen} /> : "—"} />
        <Leader code="7" label={t("record.payment")} value={row.payment_id ? <RefLink episode={episode} raw={row.payment_id} onOpen={onOpen} /> : "—"} />
      </Fields>
    </div>
  );
}

function InvoiceFields({ episode, invoice, onOpen }: { episode: Episode; invoice: Invoice; onOpen: (ref: RecordRef) => void }) {
  const { t } = useT();
  const cash = invoiceCash(episode, invoice);
  const fx = fxCheck(episode, invoice);
  const notes = deliveryNotes(invoice);
  const shared = sharedDeliveryInvoices(episode, invoice);
  const paid = cash.open === 0 && cash.paid > 0;

  return (
    <>
      <div className="relative px-5 pb-4">
        {paid ? (
          <div className="pointer-events-none absolute right-6 bottom-3">
            <Stamp tone="neutral" code="P" label={t("stamp.paid")} />
          </div>
        ) : null}
        <Fields>
          <Leader code="1" label={t("record.number")} value={<span className="font-mono">{invoice.invoice_id}</span>} />
          <Leader code="2" label={t("record.document")} value={<span className="font-mono">{invoice.doc_id}</span>} />
          <Leader code="3" label={t("record.customer")} value={<span className="font-mono">{invoice.entity_id}</span>} />
          <Leader code="4" label={t("record.issued")} value={dateTime(invoice.issued_at)} />
          <Leader code="5" label={t("record.due")} value={date(invoice.due_at)} />
          <Leader code="6" label={t("record.total")} value={<span className="font-mono">{money(invoice.total_minor, invoice.currency)}</span>} />
          <Leader code="7" label={t("record.paid")} value={<span className="font-mono">{money(cash.paid, "KZT")}</span>} />
          <Leader code="8" label={t("record.open")} value={<span className="font-mono">{money(cash.open, "KZT")}</span>} />
        </Fields>
      </div>

      {fx ? (
        <Block title={t("record.fx.title")}>
          <p className="font-mono text-[14px] leading-relaxed text-ink">
            {amount(fx.sourceMinor)} {fx.currency} × {fx.rate ? fx.rate.rate : "—"} = {fx.expectedMinor !== null ? amount(fx.expectedMinor) : "—"} KZT
          </p>
          <p className="mt-1 text-[13px] text-ink-muted">{t("record.fx.rule", { day: date(fx.policyDay), rateDay: fx.rate ? date(fx.rate.date) : "—" })}</p>
          {fx.bookedMinor !== null ? (
            <p className={`mt-2 text-[14px] ${fx.expectedMinor === fx.bookedMinor ? "text-ink-secondary" : "text-finding"}`}>
              {fx.expectedMinor === fx.bookedMinor
                ? t("record.fx.match", { booked: money(fx.bookedMinor) })
                : t("record.fx.diff", { booked: money(fx.bookedMinor), diff: signed(fx.bookedMinor - (fx.expectedMinor ?? 0)) })}
            </p>
          ) : null}
        </Block>
      ) : null}

      <Block title={t("record.lines")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th className="py-2 pr-2 font-medium">№</th>
                <th className="py-2 pr-2 font-medium">{t("record.line.item")}</th>
                <th className="py-2 pr-2 text-right font-medium">{t("record.line.qty")}</th>
                <th className="py-2 text-right font-medium">{t("record.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.line_items.map((line) => (
                <tr key={line.line_no} className="border-b border-line align-top last:border-0">
                  <td className="num py-2 pr-2 text-ink-muted">{line.line_no}</td>
                  <td className="py-2 pr-2 text-ink">
                    {line.description}
                    <span className="block font-mono text-ink-muted">
                      {line.sku} · {line.delivery_note_id}
                    </span>
                  </td>
                  <td className="num py-2 pr-2 text-right text-ink-secondary">{line.quantity}</td>
                  <td className="py-2 text-right font-mono text-ink">{amount(line.amount_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-ink-muted">
          {t("record.notes")}: <span className="font-mono">{notes.join(", ")}</span>
        </p>
        {shared.length ? (
          <p className="mt-1 text-[13px] text-ink-secondary">
            {t("record.sharedNote")}{" "}
            {shared.map((inv, i) => (
              <span key={inv.invoice_id}>
                {i ? ", " : ""}
                <RefLink episode={episode} raw={inv.invoice_id} onOpen={onOpen} />
              </span>
            ))}
          </p>
        ) : null}
      </Block>
    </>
  );
}

function PaymentFields({ episode, payment, onOpen }: { episode: Episode; payment: Payment; onOpen: (ref: RecordRef) => void }) {
  const { t } = useT();
  const split = paymentSplit(episode, payment);
  return (
    <>
      <div className="px-5 pb-4">
        <Fields>
          <Leader code="1" label={t("record.number")} value={<span className="font-mono">{payment.payment_id}</span>} />
          <Leader code="2" label={t("record.document")} value={<span className="font-mono">{payment.doc_id}</span>} />
          <Leader code="3" label={t("record.received")} value={dateTime(payment.timestamp)} />
          <Leader code="4" label={t("record.amount")} value={<span className="font-mono">{money(payment.amount_minor, payment.currency)}</span>} />
          <Leader
            code="5"
            label={t("record.namedInvoices")}
            value={
              payment.invoice_refs?.length ? (
                <span className="flex flex-wrap justify-end gap-x-2">
                  {payment.invoice_refs.map((ref) => (
                    <RefLink key={ref} episode={episode} raw={ref} onOpen={onOpen} />
                  ))}
                </span>
              ) : (
                t("record.noRefs")
              )
            }
          />
        </Fields>
      </div>
      <Block title={t("record.split")}>
        <Fields>
          <Leader label={t("record.split.applied")} value={<span className="font-mono">{money(split.applied)}</span>} />
          <Leader label={t("record.split.suspense")} value={<span className="font-mono">{money(split.suspense)}</span>} />
          <div className="double-rule pt-2">
            <Leader label={t("record.split.unapplied")} value={<span className="font-mono">{money(split.unapplied)}</span>} />
          </div>
        </Fields>
      </Block>
    </>
  );
}

function FxFields({ episode, row }: { episode: Episode; row: FxRow }) {
  const { t } = useT();
  const used = episode.invoices.filter((inv) => inv.currency === row.source_currency).length;
  return (
    <div className="px-5 pb-4">
      <Fields>
        <Leader code="1" label={t("record.rateDay")} value={date(row.date)} />
        <Leader code="2" label={t("record.pair")} value={`${row.source_currency}/${row.target_currency}`} />
        <Leader code="3" label={t("record.rate")} value={<span className="font-mono">{`1 ${row.source_currency} = ${row.rate} ${row.target_currency}`}</span>} />
      </Fields>
      <p className="mt-3 text-[13px] text-ink-muted">{t("record.fx.lot", { n: used })}</p>
    </div>
  );
}

function Linked({ episode, table, id, onOpen }: { episode: Episode; table: TableName; id: string; onOpen: (ref: RecordRef) => void }) {
  const { t } = useT();
  const ledger = linkedLedger(episode, table, id);
  const invoices = linkedInvoices(episode, table, id);
  const payments = linkedPayments(episode, table, id);
  if (!ledger.length && !invoices.length && !payments.length) return null;
  return (
    <Block title={t("record.linked")}>
      <Fields>
        {ledger.map((row) => (
          <Leader
            key={row.row_id}
            label={
              <span>
                <RefLink episode={episode} raw={row.row_id} onOpen={onOpen} /> {accountName(t, row.account, episode.accounts[row.account])}
              </span>
            }
            value={<span className="font-mono">{signed(row.debit_minor - row.credit_minor)}</span>}
          />
        ))}
        {invoices.map((inv) => (
          <Leader key={inv.invoice_id} label={<RefLink episode={episode} raw={inv.invoice_id} onOpen={onOpen} />} value={<span className="font-mono">{money(inv.total_minor, inv.currency)}</span>} />
        ))}
        {payments.map((pay) => (
          <Leader key={pay.payment_id} label={<RefLink episode={episode} raw={pay.payment_id} onOpen={onOpen} />} value={<span className="font-mono">{money(pay.amount_minor, pay.currency)}</span>} />
        ))}
      </Fields>
    </Block>
  );
}

function formatChangeValue(key: string, value: unknown): string {
  if (typeof value === "number" && key.endsWith("_minor")) return money(value);
  if (typeof value === "number" && key === "kzt") return money(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return dateTime(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return date(value);
  return String(value);
}

function TruthBlock({
  episode,
  record,
  table,
  issues,
  onOpen,
}: {
  episode: Episode;
  record: AnyRecord;
  table: TableName;
  issues: TruthIssue[];
  onOpen: (ref: RecordRef) => void;
}) {
  const { t } = useT();
  const ids = [titleOf(table, record), (record as Invoice).doc_id, (record as LedgerRow).row_id];
  const changes = changesFor(episode, ids);
  if (!issues.length && !changes.length) {
    return (
      <Block title={t("record.truth")}>
        <p className="text-[14px] text-ink-secondary">{t("record.truth.none")}</p>
      </Block>
    );
  }
  return (
    <Block title={t("record.truth")}>
      <div className="space-y-4">
        {issues.map((issue) => {
          const change = changes.find((c) => c.issue_id === issue.issue_id);
          const before = (change?.before ?? {}) as Record<string, unknown>;
          const after = (change?.after ?? {}) as Record<string, unknown>;
          const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
          return (
            <div key={issue.issue_id} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <TypeBadge type={issue.type} />
                <span className="font-mono text-[13px] text-ink-muted">{issue.issue_id}</span>
              </div>
              <Fields>
                <Leader label={t("record.truth.amount")} value={<span className="font-mono">{money(issue.expected_amount_minor, issue.currency)}</span>} />
              </Fields>
              {keys.length ? (
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-ink-muted">
                      <th className="py-1 pr-2 font-medium">{t("record.truth.field")}</th>
                      <th className="py-1 pr-2 font-medium">{t("record.truth.before")}</th>
                      <th className="py-1 font-medium">{t("record.truth.after")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => (
                      <tr key={key} className="border-t border-line align-top">
                        <td className="py-1.5 pr-2 font-mono text-ink-muted">{key}</td>
                        <td className="py-1.5 pr-2 text-ink-secondary">{key in before ? formatChangeValue(key, before[key]) : "—"}</td>
                        <td className="py-1.5 text-ink">{key in after ? formatChangeValue(key, after[key]) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {change?.decision ? <p className="text-[13px] text-ink-muted">{t("record.truth.decision", { text: change.decision })}</p> : null}
              <div className="text-[13px] text-ink-secondary">
                {t("record.truth.sets")}
                <ol className="mt-1 space-y-1">
                  {issue.evidence_sets.map((set, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="num text-ink-muted">{i + 1}.</span>
                      {set.map((raw) => (
                        <RefLink key={raw} episode={episode} raw={raw} onOpen={onOpen} />
                      ))}
                    </li>
                  ))}
                </ol>
              </div>
              <p className="text-[13px] text-ink-muted">{typeLabel(t, issue.type)}</p>
            </div>
          );
        })}
      </div>
    </Block>
  );
}

export function EpisodeBrief({ episode }: { episode: Episode }) {
  const { t } = useT();
  return (
    <div>
      <header className="px-5 pt-4 pb-3">
        <p className="text-[13px] text-ink-muted">{t("brief.kicker")}</p>
        <h2 className="mt-0.5 text-[18px] font-medium text-ink">{t("brief.title")}</h2>
        <p className="mt-1 text-[14px] text-ink-secondary">{t("brief.hint")}</p>
      </header>
      <Block title={t("brief.policy")}>
        <dl className="space-y-3 text-[14px]">
          {Object.entries(episode.policy).map(([key, value]) => (
            <div key={key}>
              <dt className="text-ink-muted">{policyLabel(t, key)}</dt>
              <dd className="m-0 mt-0.5 leading-relaxed text-ink-secondary">{value}</dd>
            </div>
          ))}
        </dl>
      </Block>
    </div>
  );
}
