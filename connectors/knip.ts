import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["migrations/*.ts", "scripts/**/*.ts", "src/admin/db.ts"],
  ignoreFiles: [
    "src/connectors/dust_project/**",
    "src/resources/dust_project_configuration_resource.ts",
    "src/resources/dust_project_conversation_resource.ts",
    "src/lib/conversation_rendering.ts",
  ],
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
    "pino-pretty",
    "danger",
    "tsconfig-paths-webpack-plugin",
  ],
  paths: {
    "@connectors/*": ["./src/*"],
  },
};

export default config;
