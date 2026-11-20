import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Play } from "lucide-react";
import { findEpisode, useDemo } from "../lib/data";
import { money, monthYear, rewardLabel } from "../lib/format";
import { truthMarks, type RecordRef } from "../lib/records";
import type { Episode } from "../lib/types";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { ButtonLink } from "../components/ui/Button";
import { Workbench } from "../components/workbench/Workbench";
import { TruthPanel } from "../components/workbench/TruthPanel";
import { RecordDrawer } from "../components/workbench/RecordDrawer";
import { NotFound } from "./NotFound";

export function EpisodePage() {
  const data = useDemo();
  const navigate = useNavigate();
  const { episodeKey } = useParams();
  const episode = findEpisode(data, episodeKey);
  const [truthOn, setTruthOn] = useState(false);
  const [selected, setSelected] = useState<RecordRef | null>(null);
  const key = episode?.key;

  useEffect(() => {
    setSelected(null);
    setTruthOn(false);
  }, [key]);

  if (!episode) return <NotFound />;

  const guidedRun =
    episode.runs.find((run) => run.kind === "replay") ?? episode.runs[0] ?? null;
  const runId = guidedRun?.id ?? "guided-review";
  const marks = truthMarks(episode);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Episode · ${episode.source}${episode.seed ? ` · seed ${episode.seed}` : ""}`}
        title={episode.label}
        description="Read the public books, follow a record into its evidence, then reveal the injected truth. Nothing on this page is writable."
        actions={
          <>
            <ButtonLink
              to={`/console/episodes/${episode.key}/runs/${runId}`}
              variant="secondary"
            >
              <Play size={14} strokeWidth={1.5} />
              Guided review
            </ButtonLink>
            <ButtonLink to="/console/episodes" variant="secondary">
              All episodes
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
        <MetaCell
          label="Period"
          value={monthYear(episode.manifest.period_start)}
          meta={`${episode.manifest.timezone} · ${episode.manifest.base_currency}`}
        />
        <MetaCell
          label="Documents"
          value={episode.manifest.counts.documents}
          meta={`${episode.manifest.counts.ledger} ledger rows`}
        />
        <MetaCell
          label="Findings"
          value={truthOn ? episode.truth.issues.length : "Sealed"}
          meta={truthOn ? "truth lens is on" : "reveal in the side panel"}
          muted={!truthOn}
        />
        <MetaCell
          label="Guided reward"
          value={rewardLabel(episode.summary.guided_score.reward)}
          meta={`${episode.summary.guided_score.inspection_steps} steps · F1 ${episode.summary.guided_score.f1.toFixed(2)}`}
        />
      </div>

      <div className="xl:hidden">
        <TruthPanel
          episode={episode}
          truthOn={truthOn}
          onTruthChange={setTruthOn}
          onOpenRef={setSelected}
          onOpenRun={() => navigate(`/console/episodes/${episode.key}/runs/${runId}`)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Workbench
          key={episode.key}
          episode={episode}
          marks={marks}
          truthOn={truthOn}
          onTruthChange={setTruthOn}
          onOpen={setSelected}
        />

        <div className="hidden min-w-0 space-y-5 xl:block">
          <TruthPanel
            episode={episode}
            truthOn={truthOn}
            onTruthChange={setTruthOn}
            onOpenRef={setSelected}
            onOpenRun={() => navigate(`/console/episodes/${episode.key}/runs/${runId}`)}
          />

          <EpisodeFacts episode={episode} truthOn={truthOn} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:hidden">
        <EpisodeFacts episode={episode} truthOn={truthOn} />
      </div>

      <RecordDrawer
        episode={episode}
        selected={selected}
        truthOn={truthOn}
        marks={marks}
        runId={runId}
        onClose={() => setSelected(null)}
        onOpen={setSelected}
      />
    </div>
  );
}

function EpisodeFacts({ episode, truthOn }: { episode: Episode; truthOn: boolean }) {
  return (
    <>
    <Panel title="Policy" meta="policy.json">
      <dl className="space-y-3 text-[11px]">
        <div>
          <dt className="text-ink-muted">Period basis</dt>
          <dd className="mt-0.5 leading-relaxed text-ink-secondary">
            {episode.policy.period_basis}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">FX rate date</dt>
          <dd className="mt-0.5 leading-relaxed text-ink-secondary">
            {episode.policy.fx_rate_date}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Unallocated receipts</dt>
          <dd className="mt-0.5 leading-relaxed text-ink-secondary">
            Account {episode.policy.unallocated_receipts_account ?? "1900"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Missing FX rate</dt>
          <dd className="mt-0.5 leading-relaxed text-ink-secondary">
            {episode.policy.fx_missing_rate}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Finding amount</dt>
          <dd className="mt-0.5 leading-relaxed text-ink-secondary">
            {episode.policy.amount_currency_for_findings ?? "KZT"} · tolerance{" "}
            <span className="num">{episode.policy.amount_tolerance_minor ?? 100}</span> minor
            units
          </dd>
        </div>
      </dl>
    </Panel>

    <Panel title="Episode brief">
      <dl className="space-y-2.5 text-[11px]">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Episode id</dt>
          <dd className="font-mono text-[11px] text-ink">{episode.manifest.episode_id}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Schema</dt>
          <dd className="num text-ink">{episode.manifest.schema_version}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Rounding</dt>
          <dd className="text-ink">{episode.manifest.rounding}</dd>
        </div>
        {truthOn ? (
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Exposed amount</dt>
            <dd className="num text-ink">
              {episode.truth.issues.length
                ? `${money(
                    episode.truth.issues.reduce(
                      (sum, issue) => sum + issue.expected_amount_minor,
                      0,
                    ),
                  )} KZT`
                : "—"}
            </dd>
          </div>
        ) : null}
      </dl>
      {episode.truth.provenance.distractors.length ? (
        <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-muted">
          {episode.truth.provenance.distractors.length} distractor decision
          {episode.truth.provenance.distractors.length === 1 ? "" : "s"} present.
        </p>
      ) : null}
    </Panel>
    </>
  );
}

function MetaCell({
  label,
  value,
  meta,
  muted = false,
}: {
  label: string;
  value: string | number;
  meta: string;
  muted?: boolean;
}) {
  return (
    <div className="bg-paper-raised px-4 py-3">
      <p className="text-[11px] font-medium text-ink-muted">{label}</p>
      <p
        className={`num mt-1 text-[16px] leading-none font-medium ${
          muted ? "text-ink-muted" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] text-ink-muted">{meta}</p>
    </div>
  );
}
