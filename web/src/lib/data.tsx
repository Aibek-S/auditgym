import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DemoData, Episode } from "./types";
import { BrandMark } from "../components/BrandMark";
import { useT } from "./i18n";

interface DataState {
  data: DemoData | null;
  error: string | null;
}

const DataContext = createContext<DataState>({ data: null, error: null });

export function DataProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
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
        if (!cancelled) setState({ data: null, error: error instanceof Error ? error.message : "load failed" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.error) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper px-6">
        <div className="max-w-sm">
          <BrandMark />
          <h1 className="mt-6 text-xl font-medium text-ink">{t("data.error.title")}</h1>
          <p className="mt-2 text-[14px] text-ink-secondary">{t("data.error.body")}</p>
          <p className="mt-3 text-[13px] text-finding">{state.error}</p>
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
            <div className="loading-line h-px w-1/2 bg-ink" />
          </div>
          <p className="text-[13px] text-ink-muted">{t("data.loading")}</p>
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

/** SHA-256 of an episode's answer key (truth issues), so the published key can be checked against the file. */
export function useTruthHash(episode: Episode | undefined): string | null {
  const [hash, setHash] = useState<string | null>(null);
  useEffect(() => {
    if (!episode || !crypto?.subtle) return;
    let cancelled = false;
    const bytes = new TextEncoder().encode(JSON.stringify(episode.truth.issues));
    crypto.subtle.digest("SHA-256", bytes).then((buf) => {
      if (cancelled) return;
      setHash(Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join(""));
    });
    return () => {
      cancelled = true;
    };
  }, [episode]);
  return hash;
}
