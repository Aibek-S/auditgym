import { useState } from "react";
import { Link } from "react-router-dom";
import { useDemo } from "../lib/data";
import { useT } from "../lib/i18n";
import { ratio, rewardLabel } from "../lib/format";
import { episodeLabel, runLabel } from "../lib/labels";
import { runPoints } from "../lib/runs";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { Scatter } from "../components/ui/Scatter";
import { Button } from "../components/ui/Button";

// Scatter above the table with copy and CSV (after ARC Prize's leaderboard).
export function Agents() {
  const data = useDemo();
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const rows = data.episodes.flatMap((episode) => episode.runs.map((run) => ({ episode, run })));

  const header = ["episode", "agent", "issues", "tp", "fp", "fn", "f1", "inspection_steps", "reward"];
  const csv = [
    header.join(","),
    ...rows.map(({ episode, run }) =>
      [episode.key, run.id, episode.truth.issues.length, run.score.tp, run.score.fp, run.score.fn, run.score.f1.toFixed(3), run.score.inspection_steps, run.score.reward.toFixed(3)].join(","),
    ),
  ].join("\n");

  async function copyTable() {
    try {
      await navigator.clipboard.writeText(csv.replace(/,/g, "\t"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function downloadCsv() {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "auditgym-runs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("agents.title")} description={t("agents.lead")} />

      <Panel title={t("overview.scatter")} meta={t("overview.scatter.meta")}>
        <Scatter points={runPoints(data, t)} />
      </Panel>

      <Panel
        title={t("agents.table")}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <span>{t("agents.rows", { n: rows.length })}</span>
            <Button size="sm" onClick={copyTable}>
              {copied ? t("agents.copied") : t("agents.copy")}
            </Button>
            <Button size="sm" onClick={downloadCsv}>
              CSV
            </Button>
          </span>
        }
        bodyClassName=""
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-[13px] text-ink-muted">
                <th className="px-5 py-3 font-medium">{t("archive.col.episode")}</th>
                <th className="px-3 py-3 font-medium">{t("agents.col.agent")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("agents.col.issues")}</th>
                <th className="px-3 py-3 text-right font-medium">TP · FP · FN</th>
                <th className="px-3 py-3 text-right font-medium">F1</th>
                <th className="px-3 py-3 text-right font-medium">{t("agents.col.steps")}</th>
                <th className="px-5 py-3 text-right font-medium">{t("agents.col.reward")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ episode, run }) => (
                <tr key={`${episode.key}/${run.id}`} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 text-[14px]">
                    <Link to={`/console/episodes/${episode.key}`} className="link">
                      {episodeLabel(t, episode)}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-[14px] text-ink-secondary">{runLabel(t, run)}</td>
                  <td className="num px-3 py-3 text-right text-[14px] text-ink-secondary">{episode.truth.issues.length}</td>
                  <td className="num px-3 py-3 text-right text-[14px] text-ink-secondary">
                    {run.score.tp} · {run.score.fp} · {run.score.fn}
                  </td>
                  <td className="num px-3 py-3 text-right text-[14px] text-ink-secondary">{ratio(run.score.f1)}</td>
                  <td className="num px-3 py-3 text-right text-[14px] text-ink-secondary">{run.score.inspection_steps}</td>
                  <td className="px-5 py-3 text-right text-[14px]">
                    <Link to={`/console/episodes/${episode.key}/runs/${run.id}`} className="link num">
                      {rewardLabel(run.score.reward)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

    </div>
  );
}
