export type IssueType =
  | "duplicate_invoice"
  | "payment_allocation"
  | "fx_conversion"
  | "period_cutoff";

export interface Manifest {
  schema_version: string;
  episode_id: string;
  base_currency: string;
  period_start: string;
  period_end: string;
  timezone: string;
  currency_exponents: Record<string, number>;
  counts: {
    ledger: number;
    invoices: number;
    payments: number;
    fx: number;
    documents: number;
  };
  rounding: string;
}

export type Policy = Record<string, string>;

export interface LedgerRow {
  row_id: string;
  timestamp: string;
  account: string;
  debit_minor: number;
  credit_minor: number;
  currency: string;
  entity_id: string | null;
  invoice_id: string | null;
  payment_id: string | null;
}

export interface LineItem {
  line_no: number;
  sku: string;
  description: string;
  quantity: number;
  unit_price_minor: number;
  amount_minor: number;
  delivery_note_id: string;
  ref_invoice_id: string | null;
}

export interface Invoice {
  doc_id: string;
  invoice_id: string;
  entity_id: string;
  issued_at: string;
  due_at: string;
  currency: string;
  total_minor: number;
  line_items: LineItem[];
}

export interface Payment {
  doc_id: string;
  payment_id: string;
  timestamp: string;
  currency: string;
  amount_minor: number;
  invoice_refs: string[] | null;
}

export interface FxRow {
  date: string;
  source_currency: string;
  target_currency: string;
  rate: string;
}

export interface TruthIssue {
  issue_id: string;
  type: IssueType;
  affected_ids: string[];
  expected_amount_minor: number;
  currency: string;
  evidence_sets: string[][];
}

export interface ProvenanceChange {
  issue_id: string | null;
  kind: string | null;
  scenario: string | null;
  decision: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  touched_ids: string[];
}

export interface Provenance {
  plan: string[] | null;
  changes: ProvenanceChange[];
  distractors: string[];
}

export interface Score {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  inspection_steps: number;
  reward: number;
}

export interface Finding {
  type: IssueType;
  affected_ids: string[];
  claimed_amount_minor: number;
  currency: string;
  evidence_ids: string[];
  explanation?: string;
}

export interface Observation {
  ok: boolean;
  result: unknown;
  error: { code: string; message: string } | null;
  steps_used: number;
  steps_remaining: number;
}

export interface RunStep {
  step: number;
  action: Record<string, unknown> & { action: string };
  label: string;
  kind: "list" | "record" | "document" | "submit";
  target: string;
  observation: Observation;
  reward: number;
  terminated: boolean;
  truncated: boolean;
}

export interface Run {
  id: string;
  label: string;
  kind: "oracle" | "replay";
  note: string;
  findings: Finding[];
  steps: RunStep[];
  score: Score;
}

export interface IssueTypeSummary {
  type: IssueType;
  label: string;
  count: number;
}

export interface Episode {
  key: string;
  label: string;
  source: "fixture" | "generated";
  seed: number | null;
  featured: boolean;
  manifest: Manifest;
  accounts: Record<string, string>;
  policy: Policy;
  ledger: LedgerRow[];
  invoices: Invoice[];
  payments: Payment[];
  fx: FxRow[];
  truth: {
    issues: TruthIssue[];
    provenance: Provenance;
  };
  runs: Run[];
  summary: {
    issue_types: IssueTypeSummary[];
    issue_count: number;
    clean: boolean;
    documents: number;
    guided_score: Score;
  };
}

export interface DemoData {
  generated_at: string;
  company: {
    name: string;
    model: string;
    base_currency: string;
  };
  stats: {
    episodes: number;
    clean: number;
    issues: number;
    types: IssueTypeSummary[];
    documents: number;
    guided_reward_mean: number;
  };
  episodes: Episode[];
}
