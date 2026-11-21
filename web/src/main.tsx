import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Familjen Grotesk sets Latin; Golos Text covers Cyrillic with the Kazakh letters (Ә Ғ Қ Ң Ө Ұ Ү Һ І),
// which Familjen lacks. Red Hat Mono sets ids and amounts; Fira Mono covers any Cyrillic in code.
import "@fontsource/familjen-grotesk/400.css";
import "@fontsource/familjen-grotesk/500.css";
import "@fontsource/familjen-grotesk/600.css";
import "@fontsource/golos-text/cyrillic-400.css";
import "@fontsource/golos-text/cyrillic-500.css";
import "@fontsource/golos-text/cyrillic-600.css";
import "@fontsource/golos-text/cyrillic-ext-400.css";
import "@fontsource/golos-text/cyrillic-ext-500.css";
import "@fontsource/golos-text/cyrillic-ext-600.css";
import "@fontsource/red-hat-mono/400.css";
import "@fontsource/red-hat-mono/500.css";
import "@fontsource/fira-mono/cyrillic-400.css";
import "./index.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
