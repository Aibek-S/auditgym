import type { IssueType } from "./types";

export const TYPE_LABELS: Record<IssueType, string> = {
  duplicate_invoice: "Duplicate invoice",
  payment_allocation: "Missing allocation",
  fx_conversion: "FX conversion",
  period_cutoff: "Period cutoff",
};

export const TYPE_NOTES: Record<IssueType, string> = {
  duplicate_invoice: "Same delivery billed twice, no reversing credit note.",
  payment_allocation: "Receipt not fully applied to the invoice it names.",
  fx_conversion: "Wrong rate date or rate against the published policy.",
  period_cutoff: "Document timestamp sits outside the booked period.",
};

const moneyFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Almaty",
});

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Almaty",
});

export function money(minor: number): string {
  return moneyFormat.format(minor / 100);
}

export function compact(minor: number): string {
  return compactFormat.format(minor / 100);
}

export function dateShort(iso: string): string {
  return dateFormat.format(new Date(iso)).replace("Sept", "Sep");
}

export function dateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso)).replace("Sept", "Sep");
}

export function shortId(value: string | null, fallback = "—"): string {
  return value ?? fallback;
}

export function accountLabel(accounts: Record<string, string>, code: string): string {
  return accounts[code] ?? `Account ${code}`;
}

export function rewardLabel(value: number): string {
  return value.toFixed(3);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function issueCountLabel(count: number): string {
  if (count === 0) return "Clean";
  return plural(count, "issue");
}

const monthYearFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "Asia/Almaty",
});

export function monthYear(iso: string): string {
  return monthYearFormat.format(new Date(iso)).replace("Sept", "Sep");
}

export function periodRange(start: string, end: string): string {
  return `${monthYear(start)} – ${monthYear(end)}`;
}
