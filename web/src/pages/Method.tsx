import { useT } from "../lib/i18n";
import { ISSUE_TYPES, typeNote } from "../lib/labels";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { TypeBadge } from "../components/ui/TypeBadge";

const DOCS = "https://github.com/Aibek-S/auditgym/blob/main/docs";
const TOOLS = ["list_records", "get_record", "get_document", "calculator", "submit"];

export function Method() {
  const { t } = useT();
  return (
    <div className="space-y-6">
      <PageHeader title={t("method.title")} description={t("method.lead")} />

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel title={t("method.episode")} className="lg:col-span-6">
          <p className="text-[15px] leading-relaxed text-ink-secondary">{t("method.episode.body")}</p>
          <p className="mt-3 rounded-control bg-paper-sunken px-4 py-3 font-mono text-[14px] leading-relaxed text-ink">
            manifest.json · ledger.csv · invoices.jsonl
            <br />
            payments.jsonl · fx.csv · policy.json
          </p>
        </Panel>

        <Panel title={t("method.tools")} className="lg:col-span-6">
          <ul className="space-y-2 text-[15px] text-ink-secondary">
            {TOOLS.map((tool) => (
              <li key={tool}>
                <span className="font-mono text-[14px] text-ink">{tool}</span> {t(`method.tool.${tool}`)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[14px] text-ink-muted">{t("method.tools.limits")}</p>
        </Panel>

        <Panel title={t("method.scoring")} className="lg:col-span-6">
          <p className="num rounded-control bg-paper-sunken px-4 py-3 text-[15px] text-ink">R = clip(2·F1 − 1 − 0.002·S, −1, 1)</p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">{t("method.scoring.body")}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-secondary">{t("method.scoring.steps")}</p>
        </Panel>

        <Panel title={t("method.truth")} className="lg:col-span-6">
          <p className="text-[15px] leading-relaxed text-ink-secondary">{t("method.truth.body")}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-secondary">{t("method.truth.replay")}</p>
        </Panel>

        <Panel title={t("method.types")} className="lg:col-span-12">
          <div className="grid gap-5 sm:grid-cols-2">
            {ISSUE_TYPES.map((type) => (
              <div key={type}>
                <TypeBadge type={type} />
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-secondary">{typeNote(t, type)}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t("method.docs")} className="lg:col-span-12">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
            <li>
              <a className="link" href={`${DOCS}/DECISIONS.md`} target="_blank" rel="noreferrer">
                DECISIONS.md
              </a>
            </li>
            <li>
              <a className="link" href={`${DOCS}/ERROR_SCENARIOS.md`} target="_blank" rel="noreferrer">
                ERROR_SCENARIOS.md
              </a>
            </li>
            <li>
              <a className="link" href={`${DOCS}/BOUNDARIES.md`} target="_blank" rel="noreferrer">
                BOUNDARIES.md
              </a>
            </li>
            <li>
              <a className="link" href={`${DOCS}/ARCHITECTURE.md`} target="_blank" rel="noreferrer">
                ARCHITECTURE.md
              </a>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
