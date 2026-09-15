import type esbuild from "esbuild";

// dd-trace instruments libraries by patching `require`, so every package it
// hooks has to stay a real module on disk. Bundling one of these silently drops
// its APM spans. `lodash` and `cookie` are deliberately left out: dd-trace hooks
// them for taint tracking rather than spans, and bundling them lets esbuild drop
// everything we do not call. Kept in sync by the check in esbuild.production.ts, which fails
// the build if dd-trace instruments something we bundled.
export const DD_TRACE_INSTRUMENTED_PACKAGES = [
  "@anthropic-ai/sdk",
  "@elastic/elasticsearch",
  "@elastic/transport",
  "@google/genai",
  "@grpc/grpc-js",
  "@opentelemetry/sdk-trace-node",
  "@redis/client",
  "@smithy/smithy-client",
  "generic-pool",
  "hono",
  "openai",
  "pg",
  "pino",
  "protobufjs",
  "redis",
  "sequelize",
  "stripe",
  "undici",
  "winston",
  "ws",
];

// Native addons and wasm: esbuild cannot inline a .node binary, and the loaders
// resolve their platform package at runtime.
export const NATIVE_PACKAGES = [
  "@img/*",
  "@napi-rs/*",
  "blake3",
  "keytar",
  "msgpackr",
  "re2-wasm",
  "sharp",
  "snowflake-sdk",
  "unix-dgram",
];

// Resolved at runtime from a variable path, so esbuild cannot follow them.
export const DYNAMIC_REQUIRE_PACKAGES = [
  // Each of these resolves a path at runtime (require.resolve, or
  // createRequire(import.meta.url)), which esbuild cannot rewrite.
  "@temporalio/interceptors-opentelemetry",
  "esbuild",
  "jsdom",
  "prettier",
];

export const EXTERNAL_PACKAGES = [
  "dd-trace",
  ...DD_TRACE_INSTRUMENTED_PACKAGES,
  ...NATIVE_PACKAGES,
  ...DYNAMIC_REQUIRE_PACKAGES,
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
    logLevel: "info",
    metafile: true,
    minifyIdentifiers: false,
    treeShaking: true,
    jsx: "automatic",
  };
}
