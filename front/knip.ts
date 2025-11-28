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
  project: ["**/*.{js,jsx,ts,tsx}"],
  rules: {
    binaries: "off",
    exports: "off",
  },
  ignoreDependencies: [
    "@vitest/coverage-v8",
    "@dust-tt/client",
    "lint-staged",
    "yalc",
  ],
  paths: {
    "@app/*": ["./*"],
  },
};

export default config;
