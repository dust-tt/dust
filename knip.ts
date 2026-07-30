import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    front: {
      entry: [
        "admin/*.ts",
        "migrations/*.ts",
        "**/cli.ts",
        "scripts/**/*.ts",
        "mailing/**/*.{ts,js}",
        "next-sitemap.config.js",
        "pages/**/*.{js,jsx,ts,tsx}",
        "app/**/*.{js,jsx,ts,tsx}",
        "start_worker.ts", // Bundled by esbuild.worker.ts, which is ignored below.
        // Consumed by front-api through the `@app/*` tsconfig alias. Knip resolves those imports
        // but does not credit them across the workspace boundary, unlike front-spa's
        // package-name imports (`@dust-tt/front/*`).
        "config/*.ts",
        "temporal/*/client.ts",
        "tests/utils/**",
      ],
      ignoreFiles: [
        "**/vite.config.js",
        "**/esbuild.worker.ts",
        "public/sw.js", // Service worker, registered at runtime by the browser.
        "components/home/content/Product/BlogSection.tsx", // Temporarily disabled due to broken blog.dust.tt images
      ],
      project: ["**/*.{js,jsx,ts,tsx}"],
      ignoreDependencies: [
        "@vitest/coverage-v8",
        "nodemon", // used for development only for workers
        "yalc",
        "pino-pretty",
        "posthog-node",
        "@dust-tt/client",
        "lefthook", // used as pre-commit hook
        "tailwindcss", // referenced from styles/global.css (@reference), not from TS
        "umzug", // required by ../scripts/db/migration-runner.ts, run from front's migration:* scripts
        "vitest-environment-node", // `@vitest-environment node` docblock, not a real package
      ],
      ignoreBinaries: ["sleep"],
      paths: {
        "@app/*": ["./*"],
      },
    },
  },
  rules: {
    binaries: "off",
    exports: "off",
  },
};

export default config;
