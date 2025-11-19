import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "admin/*.ts",
    "migrations/*.ts",
    "**/cli.ts",
    "scripts/**/*.ts",
    "mailing/**/*.{ts,js}",
  ],
  project: ["**/*.{js,jsx,ts,tsx}"],
  rules: {
    binaries: "off",
    exports: "off",
  },
  paths: {
    "@app/*": ["./*"],
  },
};

export default config;
