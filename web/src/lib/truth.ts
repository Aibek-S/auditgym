import type { Episode, FxRow, Invoice, LedgerRow, ProvenanceChange } from "./types";

/** Changes from provenance.json that touched a record (by its id or document id). */
export function changesFor(episode: Episode, ids: (string | null | undefined)[]): ProvenanceChange[] {
  const set = new Set(ids.filter(Boolean) as string[]);
  return episode.truth.provenance.changes.filter((change) => change.touched_ids.some((id) => set.has(id)));
}

/** Local business date (Asia/Almaty, +05:00) of a timestamp, as YYYY-MM-DD. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  const local = new Date(d.getTime() + 5 * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

export function fxRate(episode: Episode, day: string, source: string, target = "KZT"): FxRow | undefined {
  // The published rate for that day, else the last one before it (policy: fx_missing_rate).
  const rows = episode.fx
    .filter((row) => row.source_currency === source && row.target_currency === target && row.date <= day)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows[0];
}

/** round_half_up(source_minor * rate) with the rate taken as a decimal string, in integer arithmetic. */
export function convertMinor(sourceMinor: number, rate: string): number {
  const [whole, frac = ""] = rate.split(".");
  const scale = 10n ** BigInt(frac.length);
  const rateScaled = BigInt(whole + frac);
  const product = BigInt(sourceMinor) * rateScaled;
  const q = product / scale;
  const r = product % scale;
  return Number(r * 2n >= scale ? q + 1n : q);
}

export interface FxCheck {
  sourceMinor: number;
  currency: string;
  policyDay: string;
  rate: FxRow | undefined;
  expectedMinor: number | null;
  bookedMinor: number | null;
}

/** For a foreign-currency invoice: the amount the policy expects next to the amount booked in the ledger. */
export function fxCheck(episode: Episode, invoice: Invoice): FxCheck | null {
  if (invoice.currency === episode.manifest.base_currency) return null;
  const policyDay = localDay(invoice.issued_at);
  const rate = fxRate(episode, policyDay, invoice.currency, episode.manifest.base_currency);
  const booked = episode.ledger.find((row) => row.invoice_id === invoice.invoice_id && row.account === "1200" && row.debit_minor > 0);
  return {
    sourceMinor: invoice.total_minor,
    currency: invoice.currency,
    policyDay,
    rate,
    expectedMinor: rate ? convertMinor(invoice.total_minor, rate.rate) : null,
    bookedMinor: booked ? booked.debit_minor : null,
  };
}

export interface CleanValue {
  field: "timestamp" | "amount";
  clean: string | number;
}

/** What a ledger cell held before the planted change, where provenance says so. */
export function cleanLedgerValue(episode: Episode, row: LedgerRow): CleanValue | null {
  for (const change of changesFor(episode, [row.row_id])) {
    const before = (change.before ?? {}) as Record<string, unknown>;
    const after = (change.after ?? {}) as Record<string, unknown>;
    if (typeof before.booked_at === "string" && after.booked_at === row.timestamp) {
      return { field: "timestamp", clean: before.booked_at };
    }
    if (typeof before.ar_credit_minor === "number" && row.account === "1200" && row.credit_minor === after.ar_credit_minor) {
      return { field: "amount", clean: -before.ar_credit_minor };
    }
    if (typeof before.suspense_minor === "number" && row.account === "1900" && row.credit_minor === after.suspense_minor) {
      return { field: "amount", clean: -before.suspense_minor };
    }
    if (typeof before.rate_day === "string" && row.invoice_id) {
      const invoice = episode.invoices.find((inv) => inv.invoice_id === row.invoice_id);
      const rate = invoice ? fxRate(episode, before.rate_day, invoice.currency, episode.manifest.base_currency) : undefined;
      if (invoice && rate) {
        const clean = convertMinor(invoice.total_minor, rate.rate);
        const signedNow = row.debit_minor - row.credit_minor;
        if (Math.abs(signedNow) !== clean) return { field: "amount", clean: signedNow >= 0 ? clean : -clean };
      }
    }
  }
  return null;
}
