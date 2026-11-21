import type { Episode, IssueType, Run } from "./types";
import type { T } from "./i18n";
import type { TableName } from "./records";

// Data from the episode folders is written in English; these helpers name it in the reader's language.
// Unknown keys fall back to the file's own text, so a new episode still reads.

export const ISSUE_TYPES: IssueType[] = ["duplicate_invoice", "payment_allocation", "fx_conversion", "period_cutoff"];

export function typeLabel(t: T, type: IssueType): string {
  return t(`type.${type}`);
}

export function typeNote(t: T, type: IssueType): string {
  return t(`type.${type}.note`);
}

export function accountName(t: T, code: string, fallback?: string): string {
  const key = `acct.${code}`;
  const text = t(key);
  return text === key ? fallback ?? code : text;
}

export function episodeLabel(t: T, episode: Episode): string {
  const key = `ep.${episode.key}`;
  const text = t(key);
  return text === key ? episode.label : text;
}

export function sourceLabel(t: T, episode: Episode): string {
  return episode.source === "fixture" ? t("ep.source.fixture") : t("ep.source.generated", { seed: episode.seed ?? "—" });
}

export function runLabel(t: T, run: Run): string {
  return run.kind === "oracle" ? t("run.oracle") : t("run.guided");
}

export function runNote(t: T, run: Run): string {
  return run.kind === "oracle" ? t("run.oracle.note") : t("run.guided.note");
}

export function tableLabel(t: T, table: TableName): string {
  return t(`table.${table}`);
}

export function tableHint(t: T, table: TableName): string {
  return t(`table.${table}.hint`);
}

export function policyLabel(t: T, key: string): string {
  const k = `policy.${key}`;
  const text = t(k);
  return text === k ? key : text;
}

/** The config that reproduces a run: what the copy button puts on the clipboard. */
export function runConfig(episode: Episode, run: Run): string {
  return JSON.stringify({
    episode_id: episode.manifest.episode_id,
    scenario: episode.key,
    source: episode.source,
    seed: episode.seed,
    agent: run.id,
    period: [episode.manifest.period_start, episode.manifest.period_end],
  });
}
