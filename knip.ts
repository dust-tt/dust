import type { KnipConfig } from "knip";

// Entries and project globs ending in `!` are production code: `knip --production` only follows
// those, so code reachable from tests alone is reported as unused.
const config: KnipConfig = {
  workspaces: {
    front: {
      // The wildcard `exports` of front/package.json make every file under lib/, components/
      // and types/ an entry; without this, their unused exports are never reported.
      includeEntryExports: true,
      entry: [
        "start_worker.ts!",
        // Temporal loads workflow code by path (`require.resolve("./workflows")`), not by import.
        "temporal/**/workflows.ts!",
        "poke/temporal/workflows.ts!",
        "admin/**/*.ts!",
        "temporal/admin/*.ts!",
        "migrations/*.ts!",
        "**/cli.ts!",
        "scripts/**/*.ts!",
        "mailing/**/*.{ts,js}!",
        "dangerfile.ts",
      ],
      ignoreFiles: [
        "**/vite.config.js",
        "**/esbuild.worker.ts",
        "components/home/content/Product/BlogSection.tsx", // Temporarily disabled due to broken blog.dust.tt images
      ],
      project: [
        "**/*.{js,jsx,ts,tsx}!",
        "!tests/**!",
        "!public/**!",
        "!**/vite.*.{ts,js}!",
      ],
      ignoreDependencies: [
        "@vitest/coverage-v8",
        "nodemon", // used for development only for workers
        "yalc",
        "pino-pretty",
        "posthog-node",
        "@dust-tt/client",
        "lefthook", // used as pre-commit hook
      ],
      ignoreBinaries: ["sleep"],
      paths: {
        "@app/*": ["./*"],
      },
    },
    "front-api": {
      entry: [
        "server.ts!",
        "scripts/*.ts!",
        // Read by swagger-jsdoc from their `@swagger` comments.
        "routes/**/swagger*.ts!",
      ],
      // Legacy (non-space) public API stubs: nothing imports them, since their parent legacy
      // sub-apps re-export the space-scoped ones, but `url-aligned-route-files` in
      // front-api/CONTRACTS requires one file per URL. Brackets are escaped for the glob.
      ignoreFiles: [
        "routes/v1/w/\\[wId\\]/apps/\\[aId\\]/runs/\\[runId\\]/index.ts",
        "routes/v1/w/\\[wId\\]/data_sources/\\[dsId\\]/documents/\\[documentId\\]/{index,parents}.ts",
        "routes/v1/w/\\[wId\\]/data_sources/\\[dsId\\]/folders/\\[fId\\].ts",
        "routes/v1/w/\\[wId\\]/data_sources/\\[dsId\\]/tables/csv.ts",
        "routes/v1/w/\\[wId\\]/data_sources/\\[dsId\\]/tables/\\[tId\\]/{index,parents}.ts",
        "routes/v1/w/\\[wId\\]/data_sources/\\[dsId\\]/tables/\\[tId\\]/rows/{index,\\[rId\\]}.ts",
      ],
      project: [
        "**/*.{ts,tsx}!",
        "!tests/**!",
        "!vite.*.ts!",
        "!esbuild.*.ts!",
      ],
      paths: {
        "@app/*": ["../front/*"],
        "@front-api/*": ["./*"],
      },
    },
    "front-spa": {
      entry: ["src/*/main.tsx!", "worker/*.ts!"],
      project: ["{src,worker}/**/*.{ts,tsx}!"],
      paths: {
        "@spa/*": ["./src/*"],
        "@dust-tt/front/*": ["../front/*"],
        "@app/*": ["../front/*"],
      },
    },
    // Only there so its `@app/*` imports of front count as uses.
    extension: {
      entry: [
        "platforms/*/main.tsx!",
        "platforms/*/background.ts!",
        "platforms/*/content-script.ts!",
        // Webpack bundle entry of the chrome and firefox configs.
        "shared/page.ts!",
        // Build and watch scripts; they load the per-platform webpack configs.
        "run/*.ts!",
      ],
      project: ["{shared,platforms,ui,run}/**/*.{ts,tsx}!"],
      paths: {
        "@extension/*": ["./*"],
        "@app/*": ["../front/*"],
      },
    },
  },
  // An export used only inside its own file is an unneeded `export`, not dead code.
  ignoreExportsUsedInFile: true,
  ignoreIssues: {
    // Workflows reach activities through `proxyActivities<typeof activities>()`, which knip
    // cannot follow.
    "front/**/activities.ts": ["exports"],
    "front/**/activities/**": ["exports"],
    // Temporal reads workflow files' exports by name (workflow types, `interceptors`).
    "front/**/workflows.ts": ["exports"],
    // front-spa/vite.config.ts aliases `@app/lib/platform` to this file; knip resolves it to
    // front/lib/platform instead.
    "front-spa/src/lib/platform.tsx": ["exports", "types"],
    // Same for the extension: its webpack config aliases `@app/lib/platform` to this file.
    "extension/shared/platform.tsx": ["exports", "types"],
  },
  rules: {
    binaries: "off",
  },
};

export default config;
