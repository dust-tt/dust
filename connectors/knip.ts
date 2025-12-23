import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["migrations/*.ts", "scripts/**/*.ts", "src/admin/db.ts"],
  ignoreFiles: [],
  project: ["**/*.{js,jsx,ts,tsx}"],
  rules: {
    binaries: "off",
    exports: "off",
  },
  ignoreDependencies: [
    "@types/eslint",
    "@typescript-eslint/parser",
    "@dust-tt/client",
    "@eslint/js",
    "lint-staged",
    "pino-pretty",
  ],
  paths: {
    "@connectors/*": ["./src/*"],
  },
};

export default config;
