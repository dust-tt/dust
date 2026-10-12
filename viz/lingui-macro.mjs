import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Babel options that expand Lingui macros (`<Trans>`, `t`, `msg`) and nothing else: TS and JSX are
// only parsed, and left for Next's SWC (or Vitest's esbuild) to compile. Same options as the
// extension's `linguiMacroLoader` (extension/config/webpack_lingui.ts).
/** @type {import("@babel/core").TransformOptions} */
export const LINGUI_MACRO_BABEL_OPTIONS = {
  babelrc: false,
  configFile: false,
  plugins: [require.resolve("@lingui/babel-plugin-lingui-macro")],
  overrides: [
    { test: /\.tsx$/, parserOpts: { plugins: ["typescript", "jsx"] } },
    { test: /\.ts$/, parserOpts: { plugins: ["typescript"] } },
  ],
};
