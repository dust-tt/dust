import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@dust/sheet-engine-client/protocol": r("./ts/client/src/protocol.ts"),
      "@dust/sheet-engine-client/types": r("./ts/client/src/types.ts"),
      "@dust/sheet-engine-client": r("./ts/client/src/index.ts"),
      "@dust/sheet-engine-worker/engine-server": r("./ts/worker/src/engine-server.ts"),
      "@dust/sheet-engine-worker/node-host": r("./ts/worker/src/node-host.ts"),
      "@dust/sheet-engine-react": r("./ts/react/src/index.ts"),
    },
  },
  test: {
    include: ["ts/**/test/**/*.test.ts", "ts/**/test/**/*.test.tsx"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The FinalizationRegistry backstop test forces GC; without this flag it
    // self-skips with a warning.
    poolOptions: {
      forks: { execArgv: ["--expose-gc"] },
      threads: { execArgv: ["--expose-gc"] },
    },
    server: {
      deps: {
        // Vite must transform the kit (and its JSON atlas imports); node's
        // native ESM loader rejects JSON imports without import attributes.
        inline: ["@extend-ai/react-xlsx", "us-atlas", "world-atlas"],
      },
    },
  },
});
