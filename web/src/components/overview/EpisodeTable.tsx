import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { Episode } from "../../lib/types";
import { dateShort, money, rewardLabel, issueCountLabel } from "../../lib/format";
import { TypeBadge } from "../ui/TypeBadge";

export function EpisodeTable({ episodes }: { episodes: Episode[] }) {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[11px] font-medium text-ink-muted">
            <th className="w-[28%] px-4 py-2.5 font-medium">Episode</th>
            <th className="w-[14%] px-3 py-2.5 font-medium">Period</th>
            <th className="w-[24%] px-3 py-2.5 font-medium">Findings</th>
            <th className="w-[14%] px-3 py-2.5 text-right font-medium">Records</th>
            <th className="w-[17%] px-3 py-2.5 text-right font-medium">Guided reward</th>
            <th className="w-[3%] px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {episodes.map((episode, index) => {
            const href = `/console/episodes/${episode.key}`;
            const issues = episode.truth.issues;
            return (
              <tr
                key={episode.key}
                onClick={() => navigate(href)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(href);
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={`Open ${episode.label}`}
                className="group cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-paper-sunken/70 focus-visible:bg-paper-sunken/70"
              >
                <td className="px-4 py-3.5">
                  <Link
                    to={href}
                    onClick={(event) => event.stopPropagation()}
                    className="block no-underline"
                  >
                    <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                      {episode.label}
                      {episode.featured ? (
                        <span className="font-mono text-[11px] font-normal text-ink-muted">featured</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-ink-muted">
                      {episode.source}
                      {episode.seed ? ` · seed ${episode.seed}` : ""}
                    </span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-[12px] text-ink-secondary">
                  {dateShort(episode.manifest.period_start)}
                </td>
                <td className="px-3 py-3.5">
                  {issues.length === 0 ? (
                    <span className="inline-flex items-center gap-2 text-[12px] text-ink-secondary">
                      <span className="h-1.5 w-1.5 rounded-[1px] bg-verified" aria-hidden="true" />
                      {issueCountLabel(0)}
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {episode.summary.issue_types.map((item) => (
                        <TypeBadge key={item.type} type={item.type} count={item.count} />
                      ))}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right text-[11px] leading-relaxed text-ink-muted">
                  <span className="num block">{episode.manifest.counts.ledger} rows</span>
                  <span className="num block">
                    {episode.manifest.counts.invoices} inv · {episode.manifest.counts.payments} pay
                  </span>
                </td>
                <td className="px-3 py-3.5 text-right">
                  <span className="num inline-block text-[13px] font-medium text-ink">
                    {rewardLabel(episode.summary.guided_score.reward)}
                  </span>
                  <span className="mt-1 block h-1 w-16 overflow-hidden rounded-full bg-paper-sunken">
                    <span
                      className="animate-bar block h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.max(0, Math.min(100, episode.summary.guided_score.reward * 100))}%`,
                        animationDelay: `${index * 30}ms`,
                      }}
                    />
                  </span>
                  <span className="mt-1 block font-mono text-[11px] text-ink-muted">
                    {episode.summary.guided_score.inspection_steps} steps
                  </span>
                </td>
                <td className="px-3 py-3.5 text-right">
                  <ArrowUpRight
                    size={14}
                    strokeWidth={1.5}
                    className="inline text-ink-muted transition-colors group-hover:text-accent"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EpisodeMoney({ minor, currency = "KZT" }: { minor: number; currency?: string }) {
  return (
    <span className="num">
      {money(minor)} <span className="text-[11px] text-ink-muted">{currency}</span>
    </span>
  );
}
