import { Link, useNavigate } from "react-router-dom";
import type { Episode } from "../../lib/types";
import { useT } from "../../lib/i18n";
import { month, rewardLabel } from "../../lib/format";
import { episodeLabel, sourceLabel } from "../../lib/labels";
import { TypeBadge } from "../ui/TypeBadge";

function guidedRunId(episode: Episode): string {
  return episode.runs.find((run) => run.kind === "replay")?.id ?? "guided-review";
}

function Findings({ episode }: { episode: Episode }) {
  const { t } = useT();
  if (episode.truth.issues.length === 0) return <span className="text-ink-secondary">{t("archive.clean")}</span>;
  return (
    <span className="flex flex-col gap-1">
      {episode.summary.issue_types.map((item) => (
        <TypeBadge key={item.type} type={item.type} />
      ))}
    </span>
  );
}

export function ArchiveTable({ episodes }: { episodes: Episode[] }) {
  const { t, n } = useT();
  const navigate = useNavigate();

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <caption className="sr-only">{t("archive.caption")}</caption>
          <thead>
            <tr className="border-b border-line text-[13px] text-ink-muted">
              <th scope="col" className="px-5 py-3 font-medium">{t("archive.col.episode")}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t("archive.col.period")}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t("archive.col.findings")}</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">{t("archive.col.records")}</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">{t("archive.col.reward")}</th>
            </tr>
          </thead>
          <tbody>
            {episodes.map((episode) => {
              const href = `/console/episodes/${episode.key}`;
              const score = episode.summary.guided_score;
              return (
                <tr
                  key={episode.key}
                  onClick={() => navigate(href)}
                  className="cursor-pointer border-b border-line align-top transition-colors last:border-0 hover:bg-paper-sunken"
                >
                  <td className="px-5 py-3.5">
                    <Link to={href} onClick={(e) => e.stopPropagation()} className="link text-[15px] font-medium">
                      {episodeLabel(t, episode)}
                    </Link>
                    <span className="mt-1 block text-[13px] text-ink-muted">{sourceLabel(t, episode)}</span>
                  </td>
                  <td className="num px-4 py-3.5 text-ink-secondary">{month(episode.manifest.period_start)}</td>
                  <td className="px-4 py-3.5">
                    <Findings episode={episode} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="num block text-ink">{n("unit.ledgerRow", episode.manifest.counts.ledger)}</span>
                    <span className="num mt-1 block text-[13px] text-ink-muted">
                      {n("unit.invoice", episode.manifest.counts.invoices)} · {n("unit.payment", episode.manifest.counts.payments)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      to={`${href}/runs/${guidedRunId(episode)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="link num text-[15px]"
                      title={t("archive.reward.title")}
                    >
                      {rewardLabel(score.reward)}
                    </Link>
                    <span className="num mt-1 block text-[13px] text-ink-muted">{n("unit.step", score.inspection_steps)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {episodes.map((episode) => {
          const href = `/console/episodes/${episode.key}`;
          return (
            <li key={episode.key} className="px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <Link to={href} className="link text-[15px] font-medium">
                  {episodeLabel(t, episode)}
                </Link>
                <Link to={`${href}/runs/${guidedRunId(episode)}`} className="link num">
                  {rewardLabel(episode.summary.guided_score.reward)}
                </Link>
              </div>
              <p className="mt-1 text-[13px] text-ink-muted">
                {sourceLabel(t, episode)} · <span className="num">{month(episode.manifest.period_start)}</span> ·{" "}
                {n("unit.ledgerRow", episode.manifest.counts.ledger)}
              </p>
              <div className="mt-2 text-[14px]">
                <Findings episode={episode} />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
