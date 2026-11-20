import type { Episode, FxRow, Invoice, LedgerRow, Payment, TruthIssue } from "./types";

export type TableName = "ledger" | "invoices" | "payments" | "fx";

export interface RecordRef {
  table: TableName;
  id: string;
}

export type AnyRecord = LedgerRow | Invoice | Payment | FxRow;

export function fxKey(row: FxRow): string {
  return `${row.date}:${row.source_currency}:${row.target_currency}`;
}

export function fxPair(row: FxRow): string {
  return `${row.source_currency}/${row.target_currency}`;
}

export function recordId(table: TableName, record: AnyRecord): string {
  if (table === "ledger") return (record as LedgerRow).row_id;
  if (table === "invoices") return (record as Invoice).invoice_id;
  if (table === "payments") return (record as Payment).payment_id;
  return fxKey(record as FxRow);
}

export function tableRows(episode: Episode, table: TableName): AnyRecord[] {
  if (table === "ledger") return episode.ledger;
  if (table === "invoices") return episode.invoices;
  if (table === "payments") return episode.payments;
  return episode.fx;
}

export function tableCount(episode: Episode, table: TableName): number {
  return tableRows(episode, table).length;
}

export function resolveRecord(
  episode: Episode,
  table: TableName,
  id: string,
): AnyRecord | undefined {
  if (table === "ledger") {
    return episode.ledger.find((row) => row.row_id === id);
  }
  if (table === "invoices") {
    return episode.invoices.find((row) => row.invoice_id === id || row.doc_id === id);
  }
  if (table === "payments") {
    return episode.payments.find((row) => row.payment_id === id || row.doc_id === id);
  }
  return episode.fx.find((row) => fxKey(row) === id);
}

export function recordLabel(table: TableName, record: AnyRecord): string {
  if (table === "ledger") return (record as LedgerRow).row_id;
  if (table === "invoices") return (record as Invoice).invoice_id;
  if (table === "payments") return (record as Payment).payment_id;
  return fxPair(record as FxRow);
}

export function recordDocId(table: TableName, record: AnyRecord): string | null {
  if (table === "ledger" || table === "fx") return null;
  return (record as Invoice | Payment).doc_id;
}

export function filterRecords(
  episode: Episode,
  table: TableName,
  query: string,
): AnyRecord[] {
  const rows = tableRows(episode, table);
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;

  if (table === "ledger") {
    return (rows as LedgerRow[]).filter((row) =>
      [
        row.row_id,
        row.account,
        episode.accounts[row.account],
        row.currency,
        row.entity_id,
        row.invoice_id,
        row.payment_id,
        row.timestamp,
      ].some((value) => value?.toLowerCase().includes(needle)),
    );
  }

  if (table === "invoices") {
    return (rows as Invoice[]).filter(
      (row) =>
        row.invoice_id.toLowerCase().includes(needle) ||
        row.doc_id.toLowerCase().includes(needle) ||
        row.entity_id.toLowerCase().includes(needle) ||
        row.currency.toLowerCase().includes(needle) ||
        row.issued_at.toLowerCase().includes(needle) ||
        row.line_items.some(
          (line) =>
            line.sku.toLowerCase().includes(needle) ||
            line.description.toLowerCase().includes(needle) ||
            line.delivery_note_id.toLowerCase().includes(needle),
        ),
    );
  }

  if (table === "payments") {
    return (rows as Payment[]).filter(
      (row) =>
        row.payment_id.toLowerCase().includes(needle) ||
        row.doc_id.toLowerCase().includes(needle) ||
        row.currency.toLowerCase().includes(needle) ||
        row.timestamp.toLowerCase().includes(needle) ||
        (row.invoice_refs ?? []).some((ref) => ref.toLowerCase().includes(needle)),
    );
  }

  return (rows as FxRow[]).filter((row) =>
    [row.date, row.source_currency, row.target_currency, row.rate].some((value) =>
      value.toLowerCase().includes(needle),
    ),
  );
}

export function linkedLedger(episode: Episode, table: TableName, id: string): LedgerRow[] {
  if (table === "invoices") {
    return episode.ledger.filter((row) => row.invoice_id === id);
  }
  if (table === "payments") {
    return episode.ledger.filter((row) => row.payment_id === id);
  }
  if (table === "ledger") {
    const row = episode.ledger.find((item) => item.row_id === id);
    if (!row) return [];
    if (row.invoice_id) {
      return episode.ledger.filter(
        (item) => item.invoice_id === row.invoice_id && item.row_id !== row.row_id,
      );
    }
    if (row.payment_id) {
      return episode.ledger.filter(
        (item) => item.payment_id === row.payment_id && item.row_id !== row.row_id,
      );
    }
  }
  return [];
}

export function linkedInvoices(episode: Episode, table: TableName, id: string): Invoice[] {
  if (table === "payments") {
    const payment = episode.payments.find((row) => row.payment_id === id);
    const refs = new Set(payment?.invoice_refs ?? []);
    return episode.invoices.filter((invoice) => refs.has(invoice.invoice_id));
  }
  if (table === "ledger") {
    const row = episode.ledger.find((item) => item.row_id === id);
    if (!row?.invoice_id) return [];
    return episode.invoices.filter((invoice) => invoice.invoice_id === row.invoice_id);
  }
  return [];
}

export function linkedPayments(episode: Episode, table: TableName, id: string): Payment[] {
  if (table === "invoices") {
    return episode.payments.filter((payment) => payment.invoice_refs?.includes(id));
  }
  if (table === "ledger") {
    const row = episode.ledger.find((item) => item.row_id === id);
    if (!row?.payment_id) return [];
    return episode.payments.filter((payment) => payment.payment_id === row.payment_id);
  }
  return [];
}

export function deliveryNotes(invoice: Invoice): string[] {
  return Array.from(new Set(invoice.line_items.map((line) => line.delivery_note_id)));
}

export function sharedDeliveryInvoices(episode: Episode, invoice: Invoice): Invoice[] {
  const notes = new Set(deliveryNotes(invoice));
  return episode.invoices.filter(
    (candidate) =>
      candidate.invoice_id !== invoice.invoice_id &&
      candidate.line_items.some((line) => notes.has(line.delivery_note_id)),
  );
}

export interface PaymentSplit {
  amount: number;
  applied: number;
  suspense: number;
  unapplied: number;
}

export function paymentSplit(episode: Episode, payment: Payment): PaymentSplit {
  const rows = episode.ledger.filter((row) => row.payment_id === payment.payment_id);
  const applied = rows
    .filter((row) => row.account === "1200")
    .reduce((sum, row) => sum + row.credit_minor, 0);
  const suspense = rows
    .filter((row) => row.account === "1900")
    .reduce((sum, row) => sum + row.credit_minor, 0);
  return {
    amount: payment.amount_minor,
    applied,
    suspense,
    unapplied: Math.max(0, payment.amount_minor - applied - suspense),
  };
}

export interface InvoiceCash {
  total: number;
  paid: number;
  open: number;
}

export function invoiceCash(episode: Episode, invoice: Invoice): InvoiceCash {
  const paid = episode.ledger
    .filter((row) => row.invoice_id === invoice.invoice_id && row.payment_id && row.account === "1200")
    .reduce((sum, row) => sum + row.credit_minor, 0);
  return {
    total: invoice.total_minor,
    paid,
    open: Math.max(0, invoice.total_minor - paid),
  };
}

export interface TruthMarks {
  affected: Set<string>;
  evidence: Set<string>;
}

export function truthMarks(episode: Episode): TruthMarks {
  const affected = new Set<string>();
  const evidence = new Set<string>();
  for (const issue of episode.truth.issues) {
    issue.affected_ids.forEach((id) => affected.add(id));
    issue.evidence_sets.flat().forEach((id) => evidence.add(id));
  }
  return { affected, evidence };
}

export function recordTruthState(
  marks: TruthMarks,
  table: TableName,
  record: AnyRecord,
): "finding" | "evidence" | null {
  const id = recordId(table, record);
  const docId = recordDocId(table, record);
  if (marks.affected.has(id) || (docId && marks.affected.has(docId))) return "finding";
  if (marks.evidence.has(id) || (docId && marks.evidence.has(docId))) return "evidence";
  return null;
}

export function issuesForRecord(
  episode: Episode,
  table: TableName,
  record: AnyRecord,
): TruthIssue[] {
  const id = recordId(table, record);
  const docId = recordDocId(table, record);
  return episode.truth.issues.filter(
    (issue) =>
      issue.affected_ids.includes(id) ||
      (docId !== null && issue.affected_ids.includes(docId)) ||
      issue.evidence_sets.flat().includes(id) ||
      (docId !== null && issue.evidence_sets.flat().includes(docId)),
  );
}

export function refFromRawId(episode: Episode, rawId: string): RecordRef | null {
  if (rawId.includes(":")) {
    return episode.fx.some((row) => fxKey(row) === rawId) ? { table: "fx", id: rawId } : null;
  }
  if (episode.ledger.some((row) => row.row_id === rawId)) {
    return { table: "ledger", id: rawId };
  }
  if (episode.invoices.some((row) => row.invoice_id === rawId || row.doc_id === rawId)) {
    const invoice = episode.invoices.find(
      (row) => row.invoice_id === rawId || row.doc_id === rawId,
    );
    return invoice ? { table: "invoices", id: invoice.invoice_id } : null;
  }
  if (episode.payments.some((row) => row.payment_id === rawId || row.doc_id === rawId)) {
    const payment = episode.payments.find(
      (row) => row.payment_id === rawId || row.doc_id === rawId,
    );
    return payment ? { table: "payments", id: payment.payment_id } : null;
  }
  return null;
}

export const TABLE_LABELS: Record<TableName, string> = {
  ledger: "Ledger",
  invoices: "Invoices",
  payments: "Payments",
  fx: "FX rates",
};

export const TABLE_HINTS: Record<TableName, string> = {
  ledger: "Double-entry rows booked to the month.",
  invoices: "Issued documents with line items and delivery notes.",
  payments: "Receipts and the invoices they name.",
  fx: "Published rates used for conversion.",
};
