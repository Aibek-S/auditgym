import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Two pages: the static landing (index.html, built on the design-taste kit in public/assets) and the
// console SPA (console.html). Deep console links are rewritten to console.html in dev and preview.
function consoleFallback(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const url = req.url ?? "";
    const path = url.split("?")[0];
    if ((path === "/console" || path.startsWith("/console/") || path === "/baselines" || path === "/method") && !path.includes(".")) {
      req.url = "/console.html" + (url.includes("?") ? url.slice(url.indexOf("?")) : "");
    }
    next();
  };
  return {
    name: "console-fallback",
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), consoleFallback()],
  build: {
    assetsDir: "static",
    rollupOptions: {
      input: {
        landing: "index.html",
        console: "console.html",
      },
    },
  },
});
