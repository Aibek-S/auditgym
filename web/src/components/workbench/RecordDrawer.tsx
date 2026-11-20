import { ArrowRight } from "lucide-react";
import type { Episode, FxRow, Invoice, LedgerRow, Payment, TruthIssue } from "../../lib/types";
import { accountLabel, dateShort, dateTime, money, TYPE_NOTES } from "../../lib/format";
import {
  TABLE_LABELS,
  deliveryNotes,
  fxPair,
  invoiceCash,
  issuesForRecord,
  linkedInvoices,
  linkedLedger,
  linkedPayments,
  paymentSplit,
  recordDocId,
  recordId,
  recordLabel,
  recordTruthState,
  resolveRecord,
  sharedDeliveryInvoices,
  type RecordRef,
  type TableName,
  type TruthMarks,
} from "../../lib/records";
import { Drawer } from "../ui/Drawer";
import { Field } from "../ui/Field";
import { Stamp } from "../ui/Stamp";
import { TypeBadge } from "../ui/TypeBadge";
import { Button, ButtonLink } from "../ui/Button";
import { RawChip } from "./RawChip";

export function RecordDrawer({
  episode,
  selected,
  truthOn,
  marks,
  runId,
  onClose,
  onOpen,
}: {
  episode: Episode;
  selected: RecordRef | null;
  truthOn: boolean;
  marks: TruthMarks;
  runId: string;
  onClose: () => void;
  onOpen: (ref: RecordRef) => void;
}) {
  if (!selected) return null;

  const record = resolveRecord(episode, selected.table, selected.id);
  if (!record) return null;

  const state = recordTruthState(marks, selected.table, record);
  const issues = issuesForRecord(episode, selected.table, record);
  const docId = recordDocId(selected.table, record);

  return (
    <Drawer
      open
      onClose={onClose}
      title={recordLabel(selected.table, record)}
      subtitle={`${TABLE_LABELS[selected.table]} · ${docId ?? selected.id}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-ink-muted">{episode.manifest.episode_id}</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            <ButtonLink
              to={`/console/episodes/${episode.key}/runs/${runId}`}
              variant="primary"
              size="sm"
            >
              Guided review
              <ArrowRight size={12} strokeWidth={1.5} />
            </ButtonLink>
          </div>
        </div>
      }
    >
      <div className="px-5 py-4">
        {truthOn && state ? (
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            {state === "finding" ? (
              <Stamp tone="finding">
                Finding
              </Stamp>
            ) : (
              <span className="inline-flex items-center border border-accent/35 bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-medium text-accent">
                Evidence
              </span>
            )}
            {issues.length ? (
              <span className="font-mono text-[11px] text-ink-muted">
                {issues.map((issue) => issue.issue_id).join(" · ")}
              </span>
            ) : null}
          </div>
        ) : null}

        {selected.table === "ledger" ? (
          <LedgerDetail
            episode={episode}
            row={record as LedgerRow}
            truthOn={truthOn}
            issues={issues}
            onOpen={onOpen}
          />
        ) : selected.table === "invoices" ? (
          <InvoiceDetail
            episode={episode}
            invoice={record as Invoice}
            truthOn={truthOn}
            issues={issues}
            onOpen={onOpen}
          />
        ) : selected.table === "payments" ? (
          <PaymentDetail
            episode={episode}
            payment={record as Payment}
            truthOn={truthOn}
            issues={issues}
            onOpen={onOpen}
          />
        ) : (
          <FxDetail
            fx={record as FxRow}
            truthOn={truthOn}
            issues={issues}
            episode={episode}
            onOpen={onOpen}
          />
        )}
      </div>
    </Drawer>
  );
}

function Section({
  title,
  children,
  first = false,
}: {
  title: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section className={first ? "" : "mt-5 border-t border-line pt-4"}>
      <h3 className="text-[11px] font-medium text-ink-muted">{title}</h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Facts({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>;
}

function RecordChip({
  label,
  tone = "neutral",
  onClick,
}: {
  label: string;
  tone?: "neutral" | "finding" | "accent";
  onClick?: () => void;
}) {
  const classes =
    tone === "finding"
      ? "border-finding/30 bg-finding-soft text-finding hover:border-finding"
      : tone === "accent"
        ? "border-accent/30 bg-accent-soft text-accent hover:border-accent"
        : "border-line bg-paper-raised text-ink-secondary hover:border-accent hover:text-accent";
  if (!onClick) {
    return (
      <span className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[11px] ${classes}`}>
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors pointer-coarse:px-2.5 pointer-coarse:py-2 ${classes}`}
    >
      {label}
    </button>
  );
}

function LedgerDetail({
  episode,
  row,
  truthOn,
  issues,
  onOpen,
}: {
  episode: Episode;
  row: LedgerRow;
  truthOn: boolean;
  issues: TruthIssue[];
  onOpen: (ref: RecordRef) => void;
}) {
  const siblings = linkedLedger(episode, "ledger", row.row_id);
  const invoices = linkedInvoices(episode, "ledger", row.row_id);
  const payments = linkedPayments(episode, "ledger", row.row_id);

  return (
    <>
      <Section title="Record" first>
        <Facts>
          <Field label="Booked" className="col-span-2">
            {dateTime(row.timestamp)}
          </Field>
          <Field label="Account" className="col-span-2">
            {accountLabel(episode.accounts, row.account)}{" "}
            <span className="font-mono text-[11px] text-ink-muted">{row.account}</span>
          </Field>
          <Field label="Debit">
            {row.debit_minor ? (
              <span className="num">{money(row.debit_minor)}</span>
            ) : (
              <span className="text-ink-muted">—</span>
            )}
          </Field>
          <Field label="Credit">
            {row.credit_minor ? (
              <span className="num">{money(row.credit_minor)}</span>
            ) : (
              <span className="text-ink-muted">—</span>
            )}
          </Field>
          <Field label="Currency">{row.currency}</Field>
          <Field label="Entity" mono>
            {row.entity_id ?? "—"}
          </Field>
          <Field label="Invoice">
            {invoices[0] ? (
              <RecordChip
                label={invoices[0].invoice_id}
                onClick={() => onOpen({ table: "invoices", id: invoices[0].invoice_id })}
              />
            ) : (
              "—"
            )}
          </Field>
          <Field label="Payment">
            {payments[0] ? (
              <RecordChip
                label={payments[0].payment_id}
                onClick={() => onOpen({ table: "payments", id: payments[0].payment_id })}
              />
            ) : (
              "—"
            )}
          </Field>
          <Field label="Row id" mono className="col-span-2">
            {row.row_id}
          </Field>
        </Facts>
      </Section>

      {siblings.length ? (
        <Section title={`Sibling rows · ${siblings.length}`}>
          <div className="divide-y divide-line overflow-hidden rounded-control border border-line">
            {siblings.map((item) => (
              <button
                key={item.row_id}
                type="button"
                onClick={() => onOpen({ table: "ledger", id: item.row_id })}
                className="flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left transition-colors hover:bg-paper-sunken/60"
              >
                <span className="font-mono text-[11px] text-ink">{item.row_id}</span>
                <span className="text-[11px] text-ink-muted">
                  {accountLabel(episode.accounts, item.account)}
                </span>
                <span className="num text-[11px] text-ink-secondary">
                  {item.debit_minor ? `Dr ${money(item.debit_minor)}` : `Cr ${money(item.credit_minor)}`}
                </span>
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      <LinkedSection episode={episode} table="ledger" record={row} onOpen={onOpen} />
      <EvidenceSection episode={episode} issues={issues} truthOn={truthOn} onOpen={onOpen} />
    </>
  );
}

function InvoiceDetail({
  episode,
  invoice,
  truthOn,
  issues,
  onOpen,
}: {
  episode: Episode;
  invoice: Invoice;
  truthOn: boolean;
  issues: TruthIssue[];
  onOpen: (ref: RecordRef) => void;
}) {
  const cash = invoiceCash(episode, invoice);
  const notes = deliveryNotes(invoice);
  const shared = sharedDeliveryInvoices(episode, invoice);
  const payments = linkedPayments(episode, "invoices", invoice.invoice_id);
  const referenced = invoice.line_items.filter((line) => line.ref_invoice_id);

  return (
    <>
      <Section title="Record" first>
        <Facts>
          <Field label="Customer" mono>
            {invoice.entity_id}
          </Field>
          <Field label="Currency">{invoice.currency}</Field>
          <Field label="Issued">{dateShort(invoice.issued_at)}</Field>
          <Field label="Due">{dateShort(invoice.due_at)}</Field>
          <Field label="Total" className="col-span-2">
            <span className="num text-[15px]">
              {money(invoice.total_minor)} <span className="text-[11px] text-ink-muted">{invoice.currency}</span>
            </span>
          </Field>
          <Field label="Document" mono>
            {invoice.doc_id}
          </Field>
          <Field label="Delivery notes" mono>
            {notes.join(" · ")}
          </Field>
        </Facts>
      </Section>

      <Section title="Cash applied">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] text-ink-secondary">
            {payments.length ? "Receipts naming this invoice" : "No receipt names this invoice"}
          </span>
          <span className="num text-[11px] text-ink-muted">
            {money(cash.paid)} of {money(cash.total)}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-sunken">
          <div
            className="h-full rounded-full bg-verified"
            style={{ width: `${Math.min(100, (cash.paid / cash.total) * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-ink-muted">
          {cash.open > 0 ? `${money(cash.open)} still open` : "Fully settled"}
        </p>
        {payments.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {payments.map((payment) => (
              <RecordChip
                key={payment.payment_id}
                label={payment.payment_id}
                onClick={() => onOpen({ table: "payments", id: payment.payment_id })}
              />
            ))}
          </div>
        ) : null}
      </Section>

      {shared.length ? (
        <div className="mt-5 rounded-control border border-warning/30 bg-warning-soft px-3 py-2.5">
          <p className="text-[11px] font-medium text-warning">Shared delivery note</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">
            {notes.join(", ")} also appears on another invoice. Compare the line items before
            accepting both.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shared.map((candidate) => (
              <RecordChip
                key={candidate.invoice_id}
                label={candidate.invoice_id}
                tone="finding"
                onClick={() => onOpen({ table: "invoices", id: candidate.invoice_id })}
              />
            ))}
          </div>
        </div>
      ) : null}

      <Section title={`Line items · ${invoice.line_items.length}`}>
        <div className="overflow-hidden rounded-control border border-line">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-paper-sunken/70">
                <th className="px-2.5 py-1.5 text-[11px] font-medium text-ink-muted">Description</th>
                <th className="px-2 py-1.5 text-right text-[11px] font-medium text-ink-muted">Qty</th>
                <th className="px-2 py-1.5 text-right text-[11px] font-medium text-ink-muted">Unit</th>
                <th className="px-2.5 py-1.5 text-right text-[11px] font-medium text-ink-muted">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.line_items.map((line) => (
                <tr key={line.line_no} className="border-b border-line/60 last:border-0">
                  <td className="px-2.5 py-2">
                    <span className="block text-[11px] text-ink">{line.description}</span>
                    <span className="font-mono text-[11px] text-ink-muted">
                      {line.sku} · {line.delivery_note_id}
                      {line.ref_invoice_id ? ` · ref ${line.ref_invoice_id}` : ""}
                    </span>
                  </td>
                  <td className="num px-2 py-2 text-right text-[11px] text-ink-secondary">{line.quantity}</td>
                  <td className="num px-2 py-2 text-right text-[11px] text-ink-secondary">
                    {money(line.unit_price_minor)}
                  </td>
                  <td className="num px-2.5 py-2 text-right text-[11px] text-ink">
                    {money(line.amount_minor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {referenced.length ? (
          <p className="mt-2 text-[11px] text-ink-muted">
            {referenced.length} line{referenced.length === 1 ? "" : "s"} carry a reference to another
            invoice.
          </p>
        ) : null}
      </Section>

      <LinkedSection episode={episode} table="invoices" record={invoice} onOpen={onOpen} />
      <EvidenceSection episode={episode} issues={issues} truthOn={truthOn} onOpen={onOpen} />
    </>
  );
}

function PaymentDetail({
  episode,
  payment,
  truthOn,
  issues,
  onOpen,
}: {
  episode: Episode;
  payment: Payment;
  truthOn: boolean;
  issues: TruthIssue[];
  onOpen: (ref: RecordRef) => void;
}) {
  const split = paymentSplit(episode, payment);
  const invoices = linkedInvoices(episode, "payments", payment.payment_id);
  const pct = (value: number) => (split.amount ? (value / split.amount) * 100 : 0);

  return (
    <>
      <Section title="Record" first>
        <Facts>
          <Field label="Received" className="col-span-2">
            {dateTime(payment.timestamp)}
          </Field>
          <Field label="Amount" className="col-span-2">
            <span className="num text-[15px]">
              {money(payment.amount_minor)}{" "}
              <span className="text-[11px] text-ink-muted">{payment.currency}</span>
            </span>
          </Field>
          <Field label="Document" mono>
            {payment.doc_id}
          </Field>
          <Field label="Named invoices" mono>
            {payment.invoice_refs?.join(" · ") ?? "none"}
          </Field>
        </Facts>
      </Section>

      <Section title="Allocation">
        {payment.invoice_refs?.length ? (
          <>
            <div className="flex h-2 overflow-hidden rounded-full bg-paper-sunken">
              <span className="h-full bg-verified" style={{ width: `${pct(split.applied)}%` }} />
              <span className="h-full bg-warning" style={{ width: `${pct(split.suspense)}%` }} />
              <span className="h-full bg-finding" style={{ width: `${pct(split.unapplied)}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-ink-secondary">
                <span className="h-1.5 w-1.5 rounded-[1px] bg-verified" />
                Applied <span className="num text-ink">{money(split.applied)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-ink-secondary">
                <span className="h-1.5 w-1.5 rounded-[1px] bg-warning" />
                Suspense <span className="num text-ink">{money(split.suspense)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-ink-secondary">
                <span className="h-1.5 w-1.5 rounded-[1px] bg-finding" />
                Unapplied <span className="num text-ink">{money(split.unapplied)}</span>
              </span>
            </div>
            {split.suspense > 0 ? (
              <div className="mt-3 rounded-control border border-warning/30 bg-warning-soft px-2.5 py-2">
                <p className="text-[11px] leading-relaxed text-ink-secondary">
                  {money(split.suspense)} is parked in account 1900, so the named invoice stays open
                  by the same amount.
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-control border border-finding/30 bg-finding-soft px-2.5 py-2">
            <p className="text-[11px] leading-relaxed text-ink-secondary">
              This receipt names no invoice. The full amount belongs in account 1900 until it is
              matched.
            </p>
          </div>
        )}

        {invoices.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {invoices.map((invoice) => (
              <RecordChip
                key={invoice.invoice_id}
                label={`${invoice.invoice_id} · ${money(invoice.total_minor)}`}
                onClick={() => onOpen({ table: "invoices", id: invoice.invoice_id })}
              />
            ))}
          </div>
        ) : null}
      </Section>

      <LinkedSection episode={episode} table="payments" record={payment} onOpen={onOpen} />
      <EvidenceSection episode={episode} issues={issues} truthOn={truthOn} onOpen={onOpen} />
    </>
  );
}

function FxDetail({
  episode,
  fx,
  truthOn,
  issues,
  onOpen,
}: {
  episode: Episode;
  fx: FxRow;
  truthOn: boolean;
  issues: TruthIssue[];
  onOpen: (ref: RecordRef) => void;
}) {
  return (
    <>
      <Section title="Record" first>
        <Facts>
          <Field label="Rate date">{dateShort(fx.date)}</Field>
          <Field label="Pair" mono>
            {fxPair(fx)}
          </Field>
          <Field label="Rate" className="col-span-2">
            <span className="num text-[15px]">{fx.rate}</span>
          </Field>
          <Field label="Key" mono className="col-span-2">
            {recordId("fx", fx)}
          </Field>
        </Facts>
      </Section>
      <Section title="Policy context">
        <p className="text-[11px] leading-relaxed text-ink-secondary">
          Foreign invoices are converted at the rate on the local business date of the document
          timestamp. This issue class is about choosing the wrong rate date, not about a missing
          quote.
        </p>
      </Section>
      <EvidenceSection episode={episode} issues={issues} truthOn={truthOn} onOpen={onOpen} />
    </>
  );
}

function LinkedSection({
  episode,
  table,
  record,
  onOpen,
}: {
  episode: Episode;
  table: TableName;
  record: LedgerRow | Invoice | Payment | FxRow;
  onOpen: (ref: RecordRef) => void;
}) {
  const id = recordId(table, record);
  const ledgerRows = linkedLedger(episode, table, id);
  const invoices = linkedInvoices(episode, table, id);
  const payments = linkedPayments(episode, table, id);

  if (!ledgerRows.length && !invoices.length && !payments.length) return null;

  return (
    <Section title="Linked records">
      <div className="space-y-2.5">
        {invoices.length ? (
          <div>
            <p className="mb-1.5 text-[11px] text-ink-muted">Invoices</p>
            <div className="flex flex-wrap gap-1.5">
              {invoices.map((invoice) => (
                <RecordChip
                  key={invoice.invoice_id}
                  label={`${invoice.invoice_id} · ${money(invoice.total_minor)}`}
                  onClick={() => onOpen({ table: "invoices", id: invoice.invoice_id })}
                />
              ))}
            </div>
          </div>
        ) : null}
        {payments.length ? (
          <div>
            <p className="mb-1.5 text-[11px] text-ink-muted">Payments</p>
            <div className="flex flex-wrap gap-1.5">
              {payments.map((payment) => (
                <RecordChip
                  key={payment.payment_id}
                  label={`${payment.payment_id} · ${money(payment.amount_minor)}`}
                  onClick={() => onOpen({ table: "payments", id: payment.payment_id })}
                />
              ))}
            </div>
          </div>
        ) : null}
        {ledgerRows.length ? (
          <div>
            <p className="mb-1.5 text-[11px] text-ink-muted">Ledger rows</p>
            <div className="flex flex-wrap gap-1.5">
              {ledgerRows.map((row) => (
                <RecordChip
                  key={row.row_id}
                  label={row.row_id}
                  onClick={() => onOpen({ table: "ledger", id: row.row_id })}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function EvidenceSection({
  episode,
  issues,
  truthOn,
  onOpen,
}: {
  episode: Episode;
  issues: TruthIssue[];
  truthOn: boolean;
  onOpen: (ref: RecordRef) => void;
}) {
  if (!truthOn) return null;
  return (
    <Section title="Evidence">
      {issues.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-ink-secondary">
          This record is not linked to a recorded finding.
        </p>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => (
            <div key={issue.issue_id} className="rounded-control border border-line bg-paper p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-ink-muted">{issue.issue_id}</span>
                <TypeBadge type={issue.type} />
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{TYPE_NOTES[issue.type]}</p>
              <div className="mt-2 space-y-1.5">
                {issue.evidence_sets.map((set, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-ink-muted">{index + 1}.</span>
                    {set.map((rawId) => (
                      <RawChip key={rawId} episode={episode} rawId={rawId} onOpenRef={onOpen} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
