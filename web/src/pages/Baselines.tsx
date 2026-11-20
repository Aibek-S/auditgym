import { useDemo } from "../lib/data";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { rewardLabel } from "../lib/format";

export function Baselines() {
  const data = useDemo();
  const guidedMean =
    data.episodes.reduce((sum, episode) => sum + episode.summary.guided_score.reward, 0) /
    data.episodes.length;
  const stepsMean =
    data.episodes.reduce((sum, episode) => sum + episode.summary.guided_score.inspection_steps, 0) /
    data.episodes.length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Benchmark"
        title="Baselines"
        description="The oracle reads hidden truth and scores 1.000 by construction. The guided review is a demo replay that opens the real evidence and pays for every inspection step."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-paper-raised px-4 py-3.5">
          <p className="text-[11px] text-ink-muted">Oracle mean</p>
          <p className="num mt-1.5 text-[26px] leading-none font-medium text-ink">1.000</p>
          <p className="mt-2 text-[11px] text-ink-muted">0 inspection steps</p>
        </div>
        <div className="rounded-card border border-line bg-paper-raised px-4 py-3.5">
          <p className="text-[11px] text-ink-muted">Guided mean</p>
          <p className="num mt-1.5 text-[26px] leading-none font-medium text-ink">
            {rewardLabel(guidedMean)}
          </p>
          <p className="mt-2 text-[11px] text-ink-muted">
            {stepsMean.toFixed(1)} steps per episode
          </p>
        </div>
        <div className="rounded-card border border-line bg-paper-raised px-4 py-3.5">
          <p className="text-[11px] text-ink-muted">Episodes</p>
          <p className="num mt-1.5 text-[26px] leading-none font-medium text-ink">
            {data.episodes.length}
          </p>
          <p className="mt-2 text-[11px] text-ink-muted">fixtures and generated months</p>
        </div>
      </div>

      <Panel title="Run comparison" bodyClassName="">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-[11px] font-medium text-ink-muted">
                <th className="px-4 py-2.5 font-medium">Episode</th>
                <th className="px-3 py-2.5 text-right font-medium">Issues</th>
                <th className="px-3 py-2.5 text-right font-medium">Oracle</th>
                <th className="px-3 py-2.5 text-right font-medium">Guided</th>
                <th className="px-3 py-2.5 text-right font-medium">F1</th>
                <th className="px-3 py-2.5 text-right font-medium">Steps</th>
              </tr>
            </thead>
            <tbody>
              {data.episodes.map((episode) => {
                const oracle = episode.runs.find((run) => run.id === "oracle");
                const guided = episode.summary.guided_score;
                return (
                  <tr key={episode.key} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-3">
                      <span className="text-[12px] font-medium text-ink">{episode.label}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-ink-muted">
                        {episode.manifest.episode_id}
                      </span>
                    </td>
                    <td className="num px-3 py-3 text-right text-[11px] text-ink-secondary">
                      {episode.summary.issue_count}
                    </td>
                    <td className="num px-3 py-3 text-right text-[12px] text-ink">
                      {oracle ? rewardLabel(oracle.score.reward) : "—"}
                    </td>
                    <td className="num px-3 py-3 text-right text-[12px] text-ink">
                      {rewardLabel(guided.reward)}
                    </td>
                    <td className="num px-3 py-3 text-right text-[11px] text-ink-secondary">
                      {guided.f1.toFixed(2)}
                    </td>
                    <td className="num px-3 py-3 text-right text-[11px] text-ink-secondary">
                      {guided.inspection_steps}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Not shown yet">
        <p className="max-w-3xl text-[12px] leading-relaxed text-ink-secondary">
          The reconcile, flag-all and random policies belong to milestone M5. This build does not
          invent their numbers: the runner, matcher and trajectory log are still stubs in the
          Python package. When they land, this table reads the real{" "}
          <span className="font-mono text-[11px] text-ink">trajectories.jsonl</span> instead of the
          demo replay.
        </p>
      </Panel>
    </div>
  );
}
