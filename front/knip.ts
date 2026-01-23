import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "admin/*.ts",
    "migrations/*.ts",
    "**/cli.ts",
    "scripts/**/*.ts",
    "mailing/**/*.{ts,js}",
    "next-sitemap.config.js",
  ],
  ignoreFiles: [
    "**/vite.config.js",
    "**/esbuild.worker.ts",
    "components/home/content/Product/BlogSection.tsx", // Temporarily disabled due to broken blog.dust.tt images
    // SPA files - used by Vite build, not Next.js
    "app/src/**/*.{ts,tsx}",
    "vite.spa.config.ts",
    "lib/platform/spa.ts",
    "lib/auth/NextAuthContextProvider.tsx",
  ],
  project: ["**/*.{js,jsx,ts,tsx}"],
  rules: {
    binaries: "off",
    exports: "off",
  },
  ignoreDependencies: [
    "@vitest/coverage-v8",
    "lint-staged",
    "nodemon", // used for development only for workers
    "yalc",
    "pino-pretty",
    "posthog-node",
    "eslint-plugin-dust",
    "sqlite3", // used during the build process by sequelize
    "@dust-tt/client",
    "lefthook", // used as pre-commit hook
    "event-source-polyfill", // used in SPA mode via Vite alias
    "react-router-dom", // used in SPA mode via Vite alias
  ],
  ignoreBinaries: ["sleep"],
  paths: {
    "@app/*": ["./*"],
  },
};

export default config;
