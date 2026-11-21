import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DataProvider } from "./lib/data";
import { PrefsProvider } from "./lib/i18n";
import { AppShell } from "./components/AppShell";
import { Overview } from "./pages/Overview";
import { Episodes } from "./pages/Episodes";
import { EpisodePage } from "./pages/EpisodePage";
import { RunPage } from "./pages/RunPage";
import { Agents } from "./pages/Agents";
import { Method } from "./pages/Method";
import { LivePage } from "./pages/LivePage";
import { NotFound } from "./pages/NotFound";

// The console lives under /console; the landing page at / is a separate static page (index.html).
export function App() {
  return (
    <PrefsProvider>
      <BrowserRouter>
        <DataProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/console" element={<Overview />} />
              <Route path="/console/episodes" element={<Episodes />} />
              <Route path="/console/episodes/:episodeKey" element={<EpisodePage />} />
              <Route path="/console/episodes/:episodeKey/runs/:runId" element={<RunPage />} />
              <Route path="/console/agents" element={<Agents />} />
              <Route path="/console/method" element={<Method />} />
              <Route path="/console/live" element={<LivePage />} />
              <Route path="/baselines" element={<Navigate to="/console/agents" replace />} />
              <Route path="/method" element={<Navigate to="/console/method" replace />} />
              <Route path="/console.html" element={<Navigate to="/console" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </DataProvider>
      </BrowserRouter>
    </PrefsProvider>
  );
}
