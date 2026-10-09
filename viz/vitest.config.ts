import path from "node:path";

import { transformAsync } from "@babel/core";
import { defineConfig } from "vitest/config";

import { LINGUI_MACRO_BABEL_OPTIONS } from "./lingui-macro.mjs";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  plugins: [
    {
      // Same macro expansion as the Next build (next.config.mjs), before esbuild compiles TS/JSX.
      name: "lingui-macro",
      enforce: "pre",
      async transform(code, id) {
        // Macros are only imported from `@lingui/*/macro`, so other files have nothing to expand.
        if (
          !/\.tsx?$/.test(id) ||
          id.includes("/node_modules/") ||
          !code.includes("@lingui/")
        ) {
          return null;
        }
        const result = await transformAsync(code, {
          ...LINGUI_MACRO_BABEL_OPTIONS,
          filename: id,
          sourceMaps: true,
        });
        return result?.code ? { code: result.code, map: result.map } : null;
      },
    },
  ],
  resolve: {
    alias: {
      "@viz": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
});
