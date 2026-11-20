import { Link } from "react-router-dom";
import { ArrowRight, BookOpen } from "lucide-react";
import { useDemo } from "../lib/data";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Panel } from "../components/ui/Panel";
import { EpisodeTable } from "../components/overview/EpisodeTable";
import { FeaturedCase } from "../components/overview/FeaturedCase";
import { ErrorMix } from "../components/overview/ErrorMix";
import { ButtonLink } from "../components/ui/Button";
import { monthYear, rewardLabel } from "../lib/format";

export function Overview() {
  const data = useDemo();
  const featured = data.episodes.find((episode) => episode.featured) ?? data.episodes[0];
  const fixtureCount = data.episodes.filter((episode) => episode.source === "fixture").length;
  const generatedCount = data.episodes.length - fixtureCount;
  const starts = data.episodes.map((episode) => episode.manifest.period_start).sort();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AuditGym"
        title="Synthetic books, known answers"
        description="Open a NorthAngels month, follow the evidence, and compare the evaluator's oracle with a guided review. Every figure here comes from an episode folder."
        actions={
          <>
            <ButtonLink to={`/console/episodes/${featured.key}`} variant="primary">
              Open featured case
              <ArrowRight size={14} strokeWidth={1.5} />
            </ButtonLink>
            <ButtonLink to="/method" variant="secondary">
              <BookOpen size={14} strokeWidth={1.5} />
              Method
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Episodes"
          value={data.stats.episodes}
          meta={`${fixtureCount} hand-designed fixtures · ${generatedCount} generated`}
          className="animate-rise"
          style={{ animationDelay: "0ms" }}
        />
        <StatCard
          label="Recorded findings"
          value={data.stats.issues}
          meta="All four official error types are represented"
          className="animate-rise"
          style={{ animationDelay: "40ms" }}
        />
        <StatCard
          label="Clean months"
          value={data.stats.clean}
          meta="Silence on a clean month keeps F1 at 1.00"
          className="animate-rise"
          style={{ animationDelay: "80ms" }}
        />
        <StatCard
          label="Mean guided reward"
          value={rewardLabel(data.stats.guided_reward_mean)}
          meta={`${data.stats.documents} documents across the archive`}
          className="animate-rise"
          style={{ animationDelay: "120ms" }}
        />
      </div>

      <FeaturedCase episode={featured} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Panel title="Episode archive" meta={`${data.episodes.length} episodes`} className="min-w-0" bodyClassName="">
          <EpisodeTable episodes={data.episodes} />
          <div className="flex items-center justify-between border-t border-line px-4 py-3">
            <p className="text-[11px] text-ink-muted">
              {monthYear(starts[0])} – {monthYear(starts[starts.length - 1])} · KZT · +05:00
            </p>
            <Link
              to="/console/episodes"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent no-underline hover:text-accent-ink"
            >
              All episodes
              <ArrowRight size={12} strokeWidth={1.5} />
            </Link>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Error mix" meta={`${data.stats.issues} findings`}>
            <ErrorMix types={data.stats.types} />
            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-muted">
              Each finding is a causal change with its own evidence sets, not a label on a row.
            </p>
          </Panel>

          <Panel title="Reward" meta="per episode">
            <div className="rounded-control bg-paper-sunken px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink">
              R = clip(2·F1 − 1 − 0.002·S, −1, 1)
            </div>
            <dl className="mt-3 space-y-2 text-[11px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-secondary">Perfect answer, 40 steps</dt>
                <dd className="num text-ink">0.920</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-secondary">Silence on a clean month, 10 steps</dt>
                <dd className="num text-ink">0.980</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-secondary">One false finding on a clean month</dt>
                <dd className="num text-finding">−1.000</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
              S counts every inspection step before submit. Errors are charged; submit is not.
            </p>
            <Link
              to="/method"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-accent no-underline hover:text-accent-ink"
            >
              Scoring details
              <ArrowRight size={12} strokeWidth={1.5} />
            </Link>
          </Panel>

          <Panel title="Dataset">
            <dl className="space-y-2.5 text-[11px]">
              <div>
                <dt className="text-ink-muted">Company</dt>
                <dd className="mt-0.5 text-ink">{data.company.name}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Model</dt>
                <dd className="mt-0.5 leading-snug text-ink-secondary">{data.company.model}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Currency / zone</dt>
                <dd className="num text-ink">KZT · +05:00</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Documents</dt>
                <dd className="num text-ink">{data.stats.documents}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Generation</dt>
                <dd className="text-ink">Deterministic seeds</dd>
              </div>
            </dl>
            <div className="mt-3 border-t border-line pt-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-verified" aria-hidden="true" />
                Static demo · rebuilt from episode folders
              </span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
