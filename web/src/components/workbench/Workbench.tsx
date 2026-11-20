import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { Episode, FxRow, Invoice, LedgerRow, Payment } from "../../lib/types";
import {
  TABLE_HINTS,
  TABLE_LABELS,
  type RecordRef,
  type TableName,
  type TruthMarks,
  filterRecords,
  fxPair,
  recordId,
  recordTruthState,
  tableCount,
} from "../../lib/records";
import { accountLabel, dateTime, dateShort, money } from "../../lib/format";
import { Panel } from "../ui/Panel";
import { Toggle } from "../ui/Toggle";

const PAGE_SIZE = 25;

const tabs: TableName[] = ["ledger", "invoices", "payments", "fx"];

export function Workbench({
  episode,
  marks,
  truthOn,
  onTruthChange,
  onOpen,
}: {
  episode: Episode;
  marks: TruthMarks;
  truthOn: boolean;
  onTruthChange: (value: boolean) => void;
  onOpen: (ref: RecordRef) => void;
}) {
  const [table, setTable] = useState<TableName>("ledger");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [table, query]);

  const filtered = useMemo(() => filterRecords(episode, table, query), [episode, table, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const openRow = (id: string) => onOpen({ table, id });

  return (
    <Panel
      title="Records"
      className="min-w-0"
      meta={
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-verified" aria-hidden="true" />
          read-only
        </span>
      }
      bodyClassName=""
    >
      <div className="flex gap-0 overflow-x-auto border-b border-line px-2">
        {tabs.map((item) => {
          const active = item === table;
          return (
            <button
              key={item}
              type="button"
              onClick={() => {
                setQuery("");
                setTable(item);
              }}
              className={`relative h-10 shrink-0 px-3 text-[12px] transition-colors ${
                active ? "text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {TABLE_LABELS[item]}
              <span className="num ml-1.5 text-[11px] text-ink-muted">
                {tableCount(episode, item)}
              </span>
              {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 bg-accent" /> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search
            size={13}
            strokeWidth={1.5}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${TABLE_LABELS[table].toLowerCase()}`}
            aria-label={`Search ${TABLE_LABELS[table]}`}
            className="h-8 w-full rounded-control border border-line bg-paper pr-8 pl-8 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-muted hover:border-line-strong focus:border-accent"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-1.5 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-ink-muted hover:bg-ink/5 hover:text-ink"
              aria-label="Clear search"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {truthOn ? (
            <div className="flex items-center gap-3 text-[11px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-[1px] bg-finding" aria-hidden="true" />
                finding
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-[1px] bg-accent" aria-hidden="true" />
                evidence
              </span>
            </div>
          ) : null}
          <Toggle checked={truthOn} onChange={onTruthChange} label="Truth lens" />
        </div>
      </div>

      <p className="border-b border-line px-4 py-2 text-[11px] text-ink-muted">
        {TABLE_HINTS[table]}
      </p>

      {visible.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-[12px] text-ink-secondary">No records match “{query}”.</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-2 text-[11px] font-medium text-accent hover:text-accent-ink"
          >
            Clear search
          </button>
        </div>
      ) : (
        <>
        <MobileList
          items={mobileItems(episode, table, visible, marks)}
          truthOn={truthOn}
          onOpen={openRow}
        />
        <div className="hidden overflow-x-auto sm:block">
          {table === "ledger" ? (
            <LedgerTable
              episode={episode}
              rows={visible as LedgerRow[]}
              marks={marks}
              truthOn={truthOn}
              onOpen={openRow}
              onOpenRef={onOpen}
            />
          ) : table === "invoices" ? (
            <InvoiceTable
              rows={visible as Invoice[]}
              marks={marks}
              truthOn={truthOn}
              onOpen={openRow}
            />
          ) : table === "payments" ? (
            <PaymentTable
              rows={visible as Payment[]}
              marks={marks}
              truthOn={truthOn}
              onOpen={openRow}
            />
          ) : (
            <FxTable
              rows={visible as FxRow[]}
              marks={marks}
              truthOn={truthOn}
              onOpen={openRow}
            />
          )}
        </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        <p className="text-[11px] text-ink-muted">
          {filtered.length === 0
            ? "0 records"
            : `${safePage * PAGE_SIZE + 1}–${Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of ${filtered.length} records`}
          {query ? " matching search" : ""}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="grid h-8 w-8 place-items-center rounded-control border border-line bg-paper-raised text-ink-secondary transition-colors hover:bg-paper-sunken disabled:opacity-35"
            aria-label="Previous page"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </button>
          <span className="num px-1.5 text-[11px] text-ink-muted">
            {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
            disabled={safePage >= pageCount - 1}
            className="grid h-8 w-8 place-items-center rounded-control border border-line bg-paper-raised text-ink-secondary transition-colors hover:bg-paper-sunken disabled:opacity-35"
            aria-label="Next page"
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </Panel>
  );
}

interface MobileItem {
  id: string;
  title: ReactNode;
  value: ReactNode;
  meta: ReactNode;
  aside?: ReactNode;
  state: "finding" | "evidence" | null;
}

function mobileItems(
  episode: Episode,
  table: TableName,
  rows: (LedgerRow | Invoice | Payment | FxRow)[],
  marks: TruthMarks,
): MobileItem[] {
  return rows.map((raw) => {
    if (table === "ledger") {
      const row = raw as LedgerRow;
      const debit = Boolean(row.debit_minor);
      return {
        id: row.row_id,
        title: accountLabel(episode.accounts, row.account),
        value: `${debit ? "Dr" : "Cr"} ${money(debit ? row.debit_minor : row.credit_minor)}`,
        meta: `${dateTime(row.timestamp)} · ${row.row_id}`,
        aside: [row.invoice_id, row.payment_id].filter(Boolean).join(" · ") || row.entity_id,
        state: recordTruthState(marks, "ledger", row),
      };
    }
    if (table === "invoices") {
      const row = raw as Invoice;
      return {
        id: row.invoice_id,
        title: <span className="font-mono">{row.invoice_id}</span>,
        value: `${money(row.total_minor)} ${row.currency}`,
        meta: `${dateShort(row.issued_at)} · ${row.entity_id}`,
        aside: `${row.line_items.length} lines · ${row.doc_id}`,
        state: recordTruthState(marks, "invoices", row),
      };
    }
    if (table === "payments") {
      const row = raw as Payment;
      return {
        id: row.payment_id,
        title: <span className="font-mono">{row.payment_id}</span>,
        value: `${money(row.amount_minor)} ${row.currency}`,
        meta: dateShort(row.timestamp),
        aside: row.invoice_refs?.join(" · ") ?? <span className="text-finding">unallocated</span>,
        state: recordTruthState(marks, "payments", row),
      };
    }
    const row = raw as FxRow;
    const key = recordId("fx", row);
    return {
      id: key,
      title: <span className="font-mono">{fxPair(row)}</span>,
      value: row.rate,
      meta: dateShort(row.date),
      state: recordTruthState(marks, "fx", row),
    };
  });
}

// Below 640px the tables collapse into two-line rows: what it is and its amount, then when and which id.
function MobileList({
  items,
  truthOn,
  onOpen,
}: {
  items: MobileItem[];
  truthOn: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-line/60 sm:hidden">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen(item.id)}
            className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-paper-sunken/60 focus-visible:bg-paper-sunken/60 active:bg-paper-sunken"
          >
            {truthOn ? (
              <span
                aria-label={
                  item.state === "finding"
                    ? "Linked to a finding"
                    : item.state === "evidence"
                      ? "Evidence for a finding"
                      : undefined
                }
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-[1px] ${
                  item.state === "finding"
                    ? "bg-finding"
                    : item.state === "evidence"
                      ? "bg-accent"
                      : "bg-transparent"
                }`}
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] text-ink">{item.title}</span>
                <span className="num shrink-0 text-[13px] text-ink">{item.value}</span>
              </span>
              <span className="mt-1 flex items-baseline justify-between gap-3 text-[11px] text-ink-muted">
                <span className="truncate">{item.meta}</span>
                {item.aside ? (
                  <span className="max-w-[45%] shrink-0 truncate font-mono">{item.aside}</span>
                ) : null}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function StatusCell({
  state,
  truthOn,
}: {
  state: "finding" | "evidence" | null;
  truthOn: boolean;
}) {
  if (!truthOn) return null;
  return (
    <td className="w-5 py-2.5 pl-3">
      {state ? (
        <span
          title={state === "finding" ? "Linked to a finding" : "Evidence for a finding"}
          className={`block h-1.5 w-1.5 rounded-[1px] ${
            state === "finding" ? "bg-finding" : "bg-accent"
          }`}
        />
      ) : null}
    </td>
  );
}

const headClass = "whitespace-nowrap bg-paper-raised px-2.5 py-2 text-[11px] font-medium text-ink-muted";
const cellClass = "whitespace-nowrap px-2.5 py-2.5 text-[11px] text-ink-secondary";

function Row({
  selected,
  onOpen,
  children,
}: {
  selected?: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <tr
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      role="button"
      className={`cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-paper-sunken/60 focus-visible:bg-paper-sunken/60 ${
        selected ? "bg-accent-soft/40" : ""
      }`}
    >
      {children}
    </tr>
  );
}

function RefButton({ id, onOpen }: { id: string; onOpen?: () => void }) {
  if (!onOpen) {
    return <span className="font-mono text-[11px] text-ink-muted">{id}</span>;
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className="font-mono text-[11px] text-accent transition-colors hover:text-accent-ink"
    >
      {id}
    </button>
  );
}

function LedgerTable({
  episode,
  rows,
  marks,
  truthOn,
  onOpen,
  onOpenRef,
}: {
  episode: Episode;
  rows: LedgerRow[];
  marks: TruthMarks;
  truthOn: boolean;
  onOpen: (id: string) => void;
  onOpenRef: (ref: RecordRef) => void;
}) {
  return (
    <table className="w-full min-w-[740px] border-collapse text-left">
      <thead>
        <tr className="border-b border-line">
          {truthOn ? <th className="w-5 bg-paper-raised" /> : null}
          <th className={`${headClass} text-left`}>Date</th>
          <th className={`${headClass} text-left`}>Account</th>
          <th className={`${headClass} text-right`}>Debit</th>
          <th className={`${headClass} text-right`}>Credit</th>
          <th className={`${headClass} text-left`}>Reference</th>
          <th className={`${headClass} text-left`}>Row</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Row key={row.row_id} onOpen={() => onOpen(row.row_id)}>
            <StatusCell truthOn={truthOn} state={recordTruthState(marks, "ledger", row)} />
            <td className={cellClass}>{dateTime(row.timestamp)}</td>
            <td className={cellClass}>
              <span className="text-ink">{accountLabel(episode.accounts, row.account)}</span>
              <span className="ml-1.5 font-mono text-[11px] text-ink-muted">{row.account}</span>
            </td>
            <td className={`${cellClass} num text-right`}>
              {row.debit_minor ? (
                <span className="text-ink">{money(row.debit_minor)}</span>
              ) : (
                <span className="text-ink-muted">—</span>
              )}
            </td>
            <td className={`${cellClass} num text-right`}>
              {row.credit_minor ? (
                <span className="text-ink">{money(row.credit_minor)}</span>
              ) : (
                <span className="text-ink-muted">—</span>
              )}
            </td>
            <td className={cellClass}>
              {row.invoice_id ? (
                <RefButton
                  id={row.invoice_id}
                  onOpen={() => onOpenRef({ table: "invoices", id: row.invoice_id! })}
                />
              ) : null}
              {row.invoice_id && row.payment_id ? (
                <span className="mx-1 text-ink-muted">·</span>
              ) : null}
              {row.payment_id ? (
                <RefButton
                  id={row.payment_id}
                  onOpen={() => onOpenRef({ table: "payments", id: row.payment_id! })}
                />
              ) : null}
              {!row.invoice_id && !row.payment_id ? (
                <span className="text-ink-muted">{row.entity_id ?? "—"}</span>
              ) : null}
            </td>
            <td className={`${cellClass} font-mono text-[11px] text-ink-muted`}>{row.row_id}</td>
          </Row>
        ))}
      </tbody>
    </table>
  );
}

function InvoiceTable({
  rows,
  marks,
  truthOn,
  onOpen,
}: {
  rows: Invoice[];
  marks: TruthMarks;
  truthOn: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <table className="w-full min-w-[760px] border-collapse text-left">
      <thead>
        <tr className="border-b border-line">
          {truthOn ? <th className="w-5 bg-paper-raised" /> : null}
          <th className={`${headClass} text-left`}>Invoice</th>
          <th className={`${headClass} text-left`}>Issued</th>
          <th className={`${headClass} text-left`}>Customer</th>
          <th className={`${headClass} text-right`}>Total</th>
          <th className={`${headClass} text-right`}>Lines</th>
          <th className={`${headClass} text-left`}>Document</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Row key={row.invoice_id} onOpen={() => onOpen(row.invoice_id)}>
            <StatusCell truthOn={truthOn} state={recordTruthState(marks, "invoices", row)} />
            <td className={`${cellClass} font-mono text-[11px] text-ink`}>{row.invoice_id}</td>
            <td className={cellClass}>{dateShort(row.issued_at)}</td>
            <td className={`${cellClass} font-mono text-[11px]`}>{row.entity_id}</td>
            <td className={`${cellClass} num text-right text-ink`}>
              {money(row.total_minor)}{" "}
              <span className="text-[11px] text-ink-muted">{row.currency}</span>
            </td>
            <td className={`${cellClass} num text-right`}>{row.line_items.length}</td>
            <td className={`${cellClass} font-mono text-[11px] text-ink-muted`}>{row.doc_id}</td>
          </Row>
        ))}
      </tbody>
    </table>
  );
}

function PaymentTable({
  rows,
  marks,
  truthOn,
  onOpen,
}: {
  rows: Payment[];
  marks: TruthMarks;
  truthOn: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <table className="w-full min-w-[760px] border-collapse text-left">
      <thead>
        <tr className="border-b border-line">
          {truthOn ? <th className="w-5 bg-paper-raised" /> : null}
          <th className={`${headClass} text-left`}>Payment</th>
          <th className={`${headClass} text-left`}>Date</th>
          <th className={`${headClass} text-right`}>Amount</th>
          <th className={`${headClass} text-left`}>Named invoices</th>
          <th className={`${headClass} text-left`}>Document</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Row key={row.payment_id} onOpen={() => onOpen(row.payment_id)}>
            <StatusCell truthOn={truthOn} state={recordTruthState(marks, "payments", row)} />
            <td className={`${cellClass} font-mono text-[11px] text-ink`}>{row.payment_id}</td>
            <td className={cellClass}>{dateShort(row.timestamp)}</td>
            <td className={`${cellClass} num text-right text-ink`}>
              {money(row.amount_minor)}{" "}
              <span className="text-[11px] text-ink-muted">{row.currency}</span>
            </td>
            <td className={`${cellClass} font-mono text-[11px]`}>
              {row.invoice_refs?.join(" · ") ?? <span className="text-finding">unallocated</span>}
            </td>
            <td className={`${cellClass} font-mono text-[11px] text-ink-muted`}>{row.doc_id}</td>
          </Row>
        ))}
      </tbody>
    </table>
  );
}

function FxTable({
  rows,
  marks,
  truthOn,
  onOpen,
}: {
  rows: FxRow[];
  marks: TruthMarks;
  truthOn: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <table className="w-full min-w-[520px] border-collapse text-left">
      <thead>
        <tr className="border-b border-line">
          {truthOn ? <th className="w-5 bg-paper-raised" /> : null}
          <th className={`${headClass} text-left`}>Date</th>
          <th className={`${headClass} text-left`}>Pair</th>
          <th className={`${headClass} text-right`}>Rate</th>
          <th className={`${headClass} text-left`}>Key</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = recordId("fx", row);
          return (
            <Row key={key} onOpen={() => onOpen(key)}>
              <StatusCell truthOn={truthOn} state={recordTruthState(marks, "fx", row)} />
              <td className={cellClass}>{dateShort(row.date)}</td>
              <td className={`${cellClass} font-mono text-[11px] text-ink`}>{fxPair(row)}</td>
              <td className={`${cellClass} num text-right text-ink`}>{row.rate}</td>
              <td className={`${cellClass} font-mono text-[11px] text-ink-muted`}>{key}</td>
            </Row>
          );
        })}
      </tbody>
    </table>
  );
}
