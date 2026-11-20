import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DemoData, Episode } from "./types";
import { BrandMark } from "../components/BrandMark";

interface DataState {
  data: DemoData | null;
  error: string | null;
}

const DataContext = createContext<DataState>({ data: null, error: null });

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/demo.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<DemoData>;
      })
      .then((data) => {
        if (!cancelled) setState({ data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            error: error instanceof Error ? error.message : "Failed to load demo data",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.error) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper px-6">
        <div className="max-w-sm text-center">
          <BrandMark />
          <h1 className="mt-6 text-xl font-medium text-ink">Demo data did not load</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Run <span className="font-mono text-xs text-ink">npm run export</span> from{" "}
            <span className="font-mono text-xs text-ink">web/</span> to rebuild{" "}
            <span className="font-mono text-xs text-ink">public/data/demo.json</span>.
          </p>
          <p className="mt-3 font-mono text-xs text-finding">{state.error}</p>
        </div>
      </div>
    );
  }

  if (!state.data) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper px-6">
        <div className="flex flex-col items-center gap-5">
          <BrandMark />
          <div className="h-px w-40 overflow-hidden bg-line">
            <div className="loading-line h-px w-1/2 bg-accent" />
          </div>
          <p className="font-mono text-[11px] text-ink-muted">Loading episode archive</p>
        </div>
      </div>
    );
  }

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
}

export function useDemo(): DemoData {
  const { data } = useContext(DataContext);
  if (!data) throw new Error("useDemo must be used inside DataProvider");
  return data;
}

export function findEpisode(data: DemoData, key: string | undefined): Episode | undefined {
  return data.episodes.find((episode) => episode.key === key);
}
