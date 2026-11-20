import { useDemo } from "../lib/data";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { TypeBadge } from "../components/ui/TypeBadge";
import { TYPE_NOTES } from "../lib/format";
import type { IssueType } from "../lib/types";

const types: IssueType[] = [
  "duplicate_invoice",
  "payment_allocation",
  "fx_conversion",
  "period_cutoff",
];

export function Method() {
  const data = useDemo();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reference"
        title="How AuditGym works"
        description="A reproducible episode format, a narrow read-only tool interface, and a matcher that scores findings against hidden causal truth."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Episode contract">
          <div className="space-y-3 text-[12px] leading-relaxed text-ink-secondary">
            <p>
              Each episode is one company-month for NorthAngels FoodService Ltd. The agent sees six
              public files; the evaluator keeps truth and provenance outside the agent process.
            </p>
            <div className="rounded-control bg-paper-sunken px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink">
              manifest.json · ledger.csv · invoices.jsonl
              <br />
              payments.jsonl · fx.csv · policy.json
            </div>
            <p>
              Five actions: <span className="font-mono text-[11px] text-ink">list_records</span>,{" "}
              <span className="font-mono text-[11px] text-ink">get_record</span>,{" "}
              <span className="font-mono text-[11px] text-ink">get_document</span>,{" "}
              <span className="font-mono text-[11px] text-ink">calculator</span>,{" "}
              <span className="font-mono text-[11px] text-ink">submit</span>. Max 100 steps, page
              size 50, stable cursors.
            </p>
            <p>{data.company.name} is fictional. Its model is inspired by METRO AG; no real accounting data is reproduced.</p>
          </div>
        </Panel>

        <Panel title="Scoring">
          <div className="space-y-3 text-[12px] leading-relaxed text-ink-secondary">
            <div className="rounded-control bg-paper-sunken px-3 py-2.5 font-mono text-[11px] text-ink">
              R = clip(2·F1 − 1 − 0.002·S, −1, 1)
            </div>
            <p>
              Findings match truth one-to-one by type, affected ids, currency, amount tolerance
              (100 minor units) and a full evidence set. P, R and F1 follow the brief, including the
              empty cases.
            </p>
            <p>
              <span className="font-mono text-[11px] text-ink">S</span> is every inspection step
              before submit, errors included. Submit itself is free. The reward is only returned in
              open mode; closed evaluation keeps it on the evaluator side.
            </p>
            <p>Explanations never affect the score.</p>
          </div>
        </Panel>
      </div>

      <Panel title="Four official error types">
        <div className="grid gap-4 sm:grid-cols-2">
          {types.map((type) => (
            <div key={type} className="rounded-control border border-line bg-paper px-3 py-3">
              <TypeBadge type={type} />
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-secondary">{TYPE_NOTES[type]}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Truth and evidence">
        <div className="space-y-3 text-[12px] leading-relaxed text-ink-secondary">
          <p>
            <span className="font-mono text-[11px] text-ink">truth.json</span> records each issue:
            type, affected ids, expected amount, currency and one or more acceptable evidence sets.
            <span className="font-mono text-[11px] text-ink"> provenance.json</span> records the
            clerk decision that changed, with before and after values.
          </p>
          <p>
            The guided review in this console is a demo replay. It opens the real public records in
            the evidence set, then submits the recorded finding. It is not a policy run from the
            Python environment.
          </p>
          <p>
            <a
              href="https://github.com/Aibek-S/auditgym/blob/main/docs/DECISIONS.md"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent no-underline hover:text-accent-ink"
            >
              Decisions v0.1
            </a>
            {" · "}
            <a
              href="https://github.com/Aibek-S/auditgym/blob/main/docs/ERROR_SCENARIOS.md"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent no-underline hover:text-accent-ink"
            >
              Error scenarios
            </a>
            {" · "}
            <a
              href="https://github.com/Aibek-S/auditgym/blob/main/docs/BOUNDARIES.md"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent no-underline hover:text-accent-ink"
            >
              Boundaries
            </a>
          </p>
        </div>
      </Panel>
    </div>
  );
}
