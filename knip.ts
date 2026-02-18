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
      ],
      ignoreFiles: [
        "**/vite.config.js",
        "**/esbuild.worker.ts",
        "components/home/content/Product/BlogSection.tsx", // Temporarily disabled due to broken blog.dust.tt images
        "lib/api/sandbox/client.ts", // Sandbox client not wired up yet
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
        "@northflank/js-client", // sandbox client not wired up yet
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
