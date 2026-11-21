import type { DemoData, Episode, Run } from "./types";
import type { T } from "./i18n";
import { episodeLabel, runConfig, runLabel } from "./labels";
import type { Point } from "../components/ui/Scatter";
import type { Mark } from "../components/ui/Isotype";

export function runPoints(data: DemoData, t: T): Point[] {
  return data.episodes.flatMap((episode) =>
    episode.runs.map((run) => ({
      id: `${episode.key}/${run.id}`,
      x: run.score.inspection_steps,
      y: run.score.reward,
      kind: run.kind,
      label: `${episodeLabel(t, episode)} · ${runLabel(t, run)}`,
      config: runConfig(episode, run),
    })),
  );
}

/** One mark per planted error for a run: TP found, FN missed, plus one cross per false finding. */
export function runMarks(episode: Episode, run: Run, t: T): Mark[] {
  const issues = episode.truth.issues;
  const marks: Mark[] = issues.map((issue, index) => ({
    id: issue.issue_id,
    state: index < run.score.tp ? "found" : "missed",
    label: `${issue.issue_id}: ${index < run.score.tp ? t("marks.found") : t("marks.missed")}`,
    to: `/console/episodes/${episode.key}?issue=${issue.issue_id}`,
  }));
  for (let i = 0; i < run.score.fp; i += 1) {
    marks.push({ id: `fp-${i}`, state: "false", label: t("marks.false") });
  }
  return marks;
}

export function guidedRun(episode: Episode): Run | undefined {
  return episode.runs.find((run) => run.kind === "replay");
}
