import type { ReactNode } from "react";
import type { Episode, FxRow, Invoice, LedgerRow, Payment } from "../../lib/types";
import { useT } from "../../lib/i18n";
import { date, dateTime, money, signed, time } from "../../lib/format";
import { accountName } from "../../lib/labels";
import { cleanLedgerValue, localDay } from "../../lib/truth";
import { recordId, recordTruthState, type AnyRecord, type TableName, type TruthMarks } from "../../lib/records";

type Lens = "finding" | "evidence" | null;

const lensFill: Record<"finding" | "evidence", string> = {
  finding: "bg-finding-soft",
  evidence: "bg-evidence-soft",
};

function rowClass(lens: Lens, selected: boolean) {
  return [
    "cursor-pointer border-b border-line align-top transition-colors last:border-0",
    lens ? lensFill[lens] : "hover:bg-paper-sunken",
    selected ? "shadow-[inset_0_0_0_2px_var(--ink)]" : "",
  ].join(" ");
}

function Row({
  lens,
  selected,
  onSelect,
  label,
  children,
}: {
  lens: Lens;
  selected: boolean;
  onSelect: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <tr
      tabIndex={0}
      aria-selected={selected}
      aria-label={label}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={rowClass(lens, selected)}
    >
      {children}
    </tr>
  );
}

const th = "whitespace-nowrap bg-paper-raised px-3 py-3 text-[13px] font-medium text-ink-muted";
const td = "whitespace-nowrap px-3 py-3 text-[14px] text-ink-secondary";

function Clean({ text }: { text: string }) {
  const { t } = useT();
  return <span className="mt-0.5 block text-[13px] text-ink-muted">{t("lens.clean", { value: text })}</span>;
}

export interface ListProps {
  episode: Episode;
  table: TableName;
  rows: AnyRecord[];
  allRows: AnyRecord[];
  marks: TruthMarks;
  truthOn: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RecordList(props: ListProps) {
  const { table } = props;
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        {table === "ledger" ? <LedgerTable {...props} /> : table === "invoices" ? <InvoiceTable {...props} /> : table === "payments" ? <PaymentTable {...props} /> : <FxTable {...props} />}
      </div>
      <PhoneList {...props} />
    </>
  );
}

function LedgerTable({ episode, rows, allRows, marks, truthOn, selectedId, onSelect }: ListProps) {
  const { t } = useT();
  const ledger = rows as LedgerRow[];
  const total = (allRows as LedgerRow[]).reduce((sum, row) => sum + row.debit_minor - row.credit_minor, 0);
  return (
    <table className="w-full min-w-[680px] border-collapse text-left">
      <thead>
        <tr className="border-b border-line">
          <th className={th}>{t("col.date")}</th>
          <th className={th}>{t("col.account")}</th>
          <th className={`${th} text-right`}>{t("col.amount")}</th>
          <th className={th}>{t("col.reference")}</th>
          <th className={th}>{t("col.row")}</th>
        </tr>
      </thead>
      <tbody>
        {ledger.map((row, index) => {
          const lens = truthOn ? recordTruthState(marks, "ledger", row) : null;
          const clean = truthOn ? cleanLedgerValue(episode, row) : null;
          const sameDay = index > 0 && localDay(ledger[index - 1].timestamp) === localDay(row.timestamp);
          const amount = row.debit_minor - row.credit_minor;
          return (
            <Row key={row.row_id} lens={lens} selected={selectedId === row.row_id} onSelect={() => onSelect(row.row_id)} label={row.row_id}>
              <td className={`${td} num whitespace-nowrap`}>
                {sameDay ? (
                  <span title={dateTime(row.timestamp)}>
                    <span className="inline-block w-[5.5em] text-center text-ink-muted" aria-label={t("lens.ditto")}>
                      〃
                    </span>
                    {time(row.timestamp)}
                  </span>
                ) : (
                  dateTime(row.timestamp)
                )}
                {clean?.field === "timestamp" ? <Clean text={dateTime(String(clean.clean))} /> : null}
              </td>
              <td className={td}>
                <span className="text-ink">{accountName(t, row.account, episode.accounts[row.account])}</span>{" "}
                <span className="num text-[13px] text-ink-muted">{row.account}</span>
              </td>
              <td className={`${td} text-right font-mono whitespace-nowrap text-ink`}>
                {signed(amount)}
                {clean?.field === "amount" ? <Clean text={signed(Number(clean.clean))} /> : null}
              </td>
              <td className={`${td} font-mono text-[13px]`}>
                {[row.invoice_id, row.payment_id].filter(Boolean).join(" · ") || <span className="text-ink-muted">{row.entity_id ?? "—"}</span>}
              </td>
              <td className={`${td} font-mono text-[13px] text-ink-muted`}>{row.row_id}</td>
            </Row>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="double-rule">
          <td className={`${td} text-ink`} colSpan={2}>
            {t("list.ledger.total", { n: allRows.length })}
          </td>
          <td className={`${td} text-right font-mono text-ink`}>{signed(total)}</td>
          <td className={`${td} text-[13px] text-ink-muted`} colSpan={2}>
            {total === 0 ? t("list.ledger.balanced") : t("list.ledger.unbalanced")}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function currencyTotals(items: { currency: string; minor: number }[]): string {
  const sums = new Map<string, number>();
  for (const item of items) sums.set(item.currency, (sums.get(item.currency) ?? 0) + item.minor);
  return Array.from(sums, ([currency, minor]) => money(minor, currency)).join(" · ");
}

function InvoiceTable({ rows, allRows, marks, truthOn, selectedId, onSelect }: ListProps) {
  const { t } = useT();
  const list = rows as Invoice[];
  return (
    <table className="w-full min-w-[680px] border-collapse text-left">
      <thead>
        <tr className="border-b border-line">
          <th className={th}>{t("col.invoice")}</th>
          <th className={th}>{t("col.issued")}</th>
          <th className={th}>{t("col.customer")}</th>
          <th className={`${th} text-right`}>{t("col.total")}</th>
          <th className={`${th} text-right`}>{t("col.lines")}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((row) => {
          const lens = truthOn ? recordTruthState(marks, "invoices", row) : null;
          return (
            <Row key={row.invoice_id} lens={lens} selected={selectedId === row.invoice_id} onSelect={() => onSelect(row.invoice_id)} label={row.invoice_id}>
              <td className={`${td} font-mono text-ink`}>{row.invoice_id}</td>
              <td className={`${td} num`}>{date(row.issued_at)}</td>
              <td className={`${td} font-mono text-[13px]`}>{row.entity_id}</td>
              <td className={`${td} text-right font-mono whitespace-nowrap text-ink`}>{money(row.total_minor, row.currency)}</td>
              <td className={`${td} num text-right`}>{row.line_items.length}</td>
            </Row>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="double-rule">
          <td className={`${td} text-ink`} colSpan={3}>
            {t("list.total", { n: allRows.length })}
          </td>
          <td className={`${td} text-right font-mono text-ink`} colSpan={2}>
            {currencyTotals((allRows as Invoice[]).map((r) => ({ currency: r.currency, minor: r.total_minor })))}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function PaymentTable({ rows, allRows, marks, truthOn, selectedId, onSelect }: ListProps) {
  const { t } = useT();
  const list = rows as Payment[];
  return (
    <table className="w-full min-w-[680px] border-collapse text-left">
      <thead>
        <tr className="border-b border-line">
          <th className={th}>{t("col.payment")}</th>
          <th className={th}>{t("col.date")}</th>
          <th className={`${th} text-right`}>{t("col.amount")}</th>
          <th className={th}>{t("col.named")}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((row) => {
          const lens = truthOn ? recordTruthState(marks, "payments", row) : null;
          return (
            <Row key={row.payment_id} lens={lens} selected={selectedId === row.payment_id} onSelect={() => onSelect(row.payment_id)} label={row.payment_id}>
              <td className={`${td} font-mono text-ink`}>{row.payment_id}</td>
              <td className={`${td} num`}>{dateTime(row.timestamp)}</td>
              <td className={`${td} text-right font-mono whitespace-nowrap text-ink`}>{money(row.amount_minor, row.currency)}</td>
              <td className={`${td} font-mono text-[13px]`}>{row.invoice_refs?.join(" · ") ?? <span className="font-sans">{t("record.noRefs")}</span>}</td>
            </Row>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="double-rule">
          <td className={`${td} text-ink`} colSpan={2}>
            {t("list.total", { n: allRows.length })}
          </td>
          <td className={`${td} text-right font-mono text-ink`} colSpan={2}>
            {currencyTotals((allRows as Payment[]).map((r) => ({ currency: r.currency, minor: r.amount_minor })))}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function FxTable({ rows, marks, truthOn, selectedId, onSelect }: ListProps) {
  const { t } = useT();
  const list = rows as FxRow[];
  return (
    <table className="w-full min-w-[480px] border-collapse text-left">
      <thead>
        <tr className="border-b border-line">
          <th className={th}>{t("col.date")}</th>
          <th className={th}>{t("col.pair")}</th>
          <th className={`${th} text-right`}>{t("col.rate")}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((row) => {
          const id = recordId("fx", row);
          const lens = truthOn ? recordTruthState(marks, "fx", row) : null;
          return (
            <Row key={id} lens={lens} selected={selectedId === id} onSelect={() => onSelect(id)} label={id}>
              <td className={`${td} num`}>{date(row.date)}</td>
              <td className={`${td} font-mono`}>
                {row.source_currency}/{row.target_currency}
              </td>
              <td className={`${td} text-right font-mono text-ink`}>
                1 {row.source_currency} = {row.rate} {row.target_currency}
              </td>
            </Row>
          );
        })}
      </tbody>
    </table>
  );
}

function PhoneList({ episode, table, rows, marks, truthOn, selectedId, onSelect }: ListProps) {
  const { t } = useT();
  return (
    <ul className="divide-y divide-line sm:hidden">
      {rows.map((raw) => {
        const id = recordId(table, raw);
        const lens = truthOn ? recordTruthState(marks, table, raw) : null;
        let title = id;
        let value = "";
        let meta = "";
        if (table === "ledger") {
          const row = raw as LedgerRow;
          title = accountName(t, row.account, episode.accounts[row.account]);
          value = signed(row.debit_minor - row.credit_minor);
          meta = `${dateTime(row.timestamp)} · ${row.row_id}`;
        } else if (table === "invoices") {
          const row = raw as Invoice;
          value = money(row.total_minor, row.currency);
          meta = `${date(row.issued_at)} · ${row.entity_id}`;
        } else if (table === "payments") {
          const row = raw as Payment;
          value = money(row.amount_minor, row.currency);
          meta = `${date(row.timestamp)} · ${row.invoice_refs?.join(" · ") ?? t("record.noRefs")}`;
        } else {
          const row = raw as FxRow;
          title = `${row.source_currency}/${row.target_currency}`;
          value = row.rate;
          meta = date(row.date);
        }
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onSelect(id)}
              aria-pressed={selectedId === id}
              className={`flex min-h-14 w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${lens ? lensFill[lens] : "active:bg-paper-sunken"}`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className={`truncate text-[15px] text-ink ${table === "ledger" ? "" : "font-mono"}`}>{title}</span>
                <span className="shrink-0 font-mono text-[14px] text-ink">{value}</span>
              </span>
              <span className="truncate text-[13px] text-ink-muted">{meta}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
