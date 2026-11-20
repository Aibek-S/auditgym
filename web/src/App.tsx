import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DataProvider } from "./lib/data";
import { AppShell } from "./components/AppShell";
import { Overview } from "./pages/Overview";
import { Episodes } from "./pages/Episodes";
import { EpisodePage } from "./pages/EpisodePage";
import { RunPage } from "./pages/RunPage";
import { Baselines } from "./pages/Baselines";
import { Method } from "./pages/Method";
import { NotFound } from "./pages/NotFound";
import { Landing } from "./pages/Landing";

export function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<AppShell />}>
            <Route path="/console" element={<Overview />} />
            <Route path="/console/episodes" element={<Episodes />} />
            <Route path="/console/episodes/:episodeKey" element={<EpisodePage />} />
            <Route path="/console/episodes/:episodeKey/runs/:runId" element={<RunPage />} />
            <Route path="/baselines" element={<Baselines />} />
            <Route path="/method" element={<Method />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </DataProvider>
    </BrowserRouter>
  );
}
