import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3008,
    open: true,
  },
  resolve: {
    alias: {
      "@dust-tt/sparkle": path.resolve(__dirname, "../src"),
      "@sparkle": path.resolve(__dirname, "../src"),
      // Lets stories import real `front` components so we iterate on the
      // actual thing rather than a copy that drifts. Only pull in components
      // whose dependency graph is browser-only (no SWR/auth/server imports).
      // Must come before the "@app" catch-all: the real logger pulls in pino
      // and process.env, which don't exist in the browser.
      "@app/logger/logger": path.resolve(__dirname, "src/stubs/logger.ts"),
      "@app": path.resolve(__dirname, "../../front"),
    },
  },
  define: {
    // Some transitively imported `front` modules read process.env at module
    // scope (env helpers, feature flags).
    "process.env": "{}",
  },
});
