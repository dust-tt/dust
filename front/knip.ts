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
  ],
  ignoreBinaries: ["sleep"],
  paths: {
    "@app/*": ["./*"],
  },
};

export default config;
