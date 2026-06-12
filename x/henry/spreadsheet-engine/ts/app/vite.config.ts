import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Demo app for the Rust/WASM sheet engine. The engine worker is bundled via
// `new Worker(new URL("./engine-worker", import.meta.url), { type: "module" })`
// in src/use-engine-client.ts; the wasm-bindgen glue inside it resolves
// engine_bg.wasm relative to its own module URL, which Vite emits as a hashed
// static asset (see the repo README, "Worker + wasm asset setup").
export default defineConfig({
  plugins: [react()],
  // Sample workbooks are imported straight from the committed corpus with
  // `?url`; .xlsx/.csv/.tsv are not asset extensions Vite knows by default.
  assetsInclude: ["**/*.xlsx", "**/*.csv", "**/*.tsv"],
  worker: {
    format: "es",
  },
  server: {
    fs: {
      // The corpus and the worker wasm build live outside ts/app.
      allow: ["../.."],
    },
  },
});
