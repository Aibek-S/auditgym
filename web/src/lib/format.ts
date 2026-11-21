// Number and date formats chosen in the brief: "78 400.00 KZT" (space for thousands, point for
// decimals, ISO code after the amount) and "01.09.2026". All dates are shown in Asia/Almaty,
// the episodes' own zone.

const NBSP = " ";
const MINUS = "−";

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 7840000 -> "78 400.00" */
export function amount(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toString();
  const cents = (abs % 100).toString().padStart(2, "0");
  return `${negative ? MINUS : ""}${groupThousands(whole)}.${cents}`;
}

/** 7840000, "KZT" -> "78 400.00 KZT" */
export function money(minor: number, currency = "KZT"): string {
  return `${amount(minor)}${NBSP}${currency}`;
}

/** Signed ledger amount: debit positive, credit negative. */
export function signedMinor(debit: number, credit: number): number {
  return debit - credit;
}

/** "+146 000.00" / "−146 000.00" */
export function signed(minor: number): string {
  if (minor === 0) return "0.00";
  return `${minor > 0 ? "+" : MINUS}${amount(Math.abs(minor))}`;
}

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Almaty",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function pieces(iso: string) {
  const out: Record<string, string> = {};
  for (const p of parts.formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}

/** "2026-09-01..." -> "01.09.2026" (plain dates like "2027-01-01" are read as calendar days) */
export function date(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }
  const p = pieces(iso);
  return `${p.day}.${p.month}.${p.year}`;
}

/** "01.09.2026 13:14" */
export function dateTime(iso: string): string {
  const p = pieces(iso);
  return `${p.day}.${p.month}.${p.year} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** "13:14" */
export function time(iso: string): string {
  const p = pieces(iso);
  return `${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** "09.2026" */
export function month(iso: string): string {
  const p = pieces(iso);
  return `${p.month}.${p.year}`;
}

export function rewardLabel(value: number): string {
  return `${value < 0 ? MINUS : ""}${Math.abs(value).toFixed(3)}`;
}

export function ratio(value: number): string {
  return value.toFixed(3);
}
