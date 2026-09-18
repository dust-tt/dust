import datadogEsbuildPlugin from "dd-trace/esbuild";
import type esbuild from "esbuild";

export const OPTIONAL_NATIVE_PACKAGES = [
  "@datadog/libdatadog",
  "@datadog/native-appsec",
  "@datadog/native-iast-taint-tracking",
  "@datadog/native-metrics",
  "@datadog/pprof",
  "@datadog/wasm-js-rewriter",
  "unix-dgram",
];

// Native addons and wasm: esbuild cannot inline a .node binary, and the loaders
// resolve their platform package at runtime.
export const NATIVE_PACKAGES = [
  ...OPTIONAL_NATIVE_PACKAGES,
  "@img/*",
  "@napi-rs/*",
  "blake3",
  "keytar",
  "msgpackr",
  "re2-wasm",
  "sharp",
  "snowflake-sdk",
];

// Resolved at runtime from a variable path, so esbuild cannot follow them.
export const DYNAMIC_REQUIRE_PACKAGES = [
  // Each of these resolves a path at runtime (require.resolve, or
  // createRequire(import.meta.url)), which esbuild cannot rewrite.
  "@temporalio/interceptors-opentelemetry",
  "esbuild",
  "jsdom",
  "prettier",
  "tinyglobby",
];

export const OPTIONAL_PACKAGES = [
  "@openfeature/core",
  "@openfeature/server-sdk",
  "bufferutil",
  "encoding",
  "pg-hstore",
  "pg-native",
  "utf-8-validate",
];

export const EXTERNAL_PACKAGES = [
  ...NATIVE_PACKAGES,
  ...DYNAMIC_REQUIRE_PACKAGES,
  ...OPTIONAL_PACKAGES,
];

export interface BuildTarget {
  name: string;
  entry: string;
  outfile: string;
}

// server.ts is the Hono-only runtime target (`npm start` in this workspace).
export const BUILD_TARGETS: BuildTarget[] = [
  { name: "server", entry: "server.ts", outfile: "dist/server.js" },
  { name: "migrate", entry: "scripts/migrate.ts", outfile: "dist/migrate.js" },
];

// Options shared by dev and production builds. Mode-specific options
// (sourcemap, minification, legal comments, extra plugins) are layered on
// by each caller — keep this list minimal and free of dev/prod branching.
//
// We deliberately do NOT mangle identifiers: server-side libs (Sequelize,
// class-based resources) rely on Function.prototype.name and class names for
// reflection, and readable stack traces matter in prod logs.
export function getBaseBuildOptions(target: BuildTarget): esbuild.BuildOptions {
  return {
    entryPoints: [target.entry],
    bundle: true,
    platform: "node",
    target: "node22",
    outfile: target.outfile,
    alias: {
      "@app": "../front",
    },
    external: EXTERNAL_PACKAGES,
    plugins: target.name === "server" ? [datadogEsbuildPlugin] : undefined,
    logLevel: "info",
    metafile: true,
    minifyIdentifiers: false,
    treeShaking: true,
    jsx: "automatic",
  };
}
