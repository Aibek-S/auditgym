// Client for the local live bridge (`python -m auditgym serve`). The browser plays the agent:
// it sees observations only; the answer key is fetched after the episode ends.
import type { Observation, TruthIssue } from "./types";

// Production build: the API is served from the same origin (python -m auditgym serve --static web/dist).
// Dev server (npm run dev): the bridge runs separately on port 8765.
export const LIVE_API =
  (import.meta.env.VITE_AUDITGYM_API as string | undefined) ?? (import.meta.env.DEV ? "http://127.0.0.1:8765/api" : "/api");

export const PLANS = ["random", "clean", "duplicate_invoice", "payment_allocation", "fx_conversion", "period_cutoff", "I1", "I2"] as const;
export type Plan = (typeof PLANS)[number];

export interface LiveStep {
  action: Record<string, unknown> & { action?: string };
  observation: Observation;
  reward: number;
  terminated: boolean;
  truncated: boolean;
}

export interface LiveSession {
  session: string;
  seed: number;
  plan: Plan;
  observation: Observation;
  info: { episode_id: string; mode: string };
}

export interface LiveTruth {
  issues: TruthIssue[];
  evaluation: Record<string, unknown> | null;
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${response.status}`);
  return body as T;
}

export async function health(): Promise<{ ok: boolean; scored: boolean }> {
  return json(await fetch(`${LIVE_API}/health`));
}

export async function policies(): Promise<string[]> {
  return (await json<{ policies: string[] }>(await fetch(`${LIVE_API}/policies`))).policies;
}

export async function createSession(seed: number, plan: Plan, mode: "open" | "closed"): Promise<LiveSession> {
  return json(
    await fetch(`${LIVE_API}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed, plan, mode }),
    }),
  );
}

export async function sendStep(session: string, action: unknown): Promise<LiveStep> {
  return json(
    await fetch(`${LIVE_API}/sessions/${session}/step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }),
  );
}

export async function fetchTruth(session: string): Promise<LiveTruth> {
  return json(await fetch(`${LIVE_API}/sessions/${session}/truth`));
}

/** Streams the policy's steps as server-sent events. Returns a stop function. */
export function streamRun(
  session: string,
  policy: string,
  delayMs: number,
  onStep: (step: LiveStep) => void,
  onEnd: () => void,
  onError: (message: string) => void,
): () => void {
  const source = new EventSource(`${LIVE_API}/sessions/${session}/run?policy=${encodeURIComponent(policy)}&delay_ms=${delayMs}`);
  let ended = false;
  source.addEventListener("step", (event) => onStep(JSON.parse((event as MessageEvent).data) as LiveStep));
  source.addEventListener("end", () => {
    ended = true;
    source.close();
    onEnd();
  });
  source.onerror = () => {
    source.close();
    if (!ended) onError("stream closed");
  };
  return () => {
    ended = true;
    source.close();
  };
}
