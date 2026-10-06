import type esbuild from "esbuild";

import { linguiPlugin } from "./esbuild.lingui";

// ESM-only packages that Node 22 cannot correctly `require()` at runtime
// (it wraps the default export in `{ default: ... }`, breaking the
// library's internal validation). Bundle these via esbuild instead of
// externalizing them, so CJS/ESM interop is resolved at build time.
//
// Add new entries here as we discover them during migration. Sparkle is here for another reason:
// Node cannot load its ESM build at all, because of directory imports.
export const ESM_ONLY_PACKAGES = ["libphonenumber-js", "@dust-tt/sparkle"];

// Externalize every node_modules import (`bare specifier`, i.e. doesn't
// start with `.` or `/`) by default, except for the packages above which
// esbuild bundles inline. This replaces the broader `packages: "external"`
// option which had no way to opt specific packages back into bundling.
export const bundleEsmPlugin: esbuild.Plugin = {
  name: "bundle-esm-packages",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      // Path aliases (`@app/*`, `@front-api/*`) point at source code we want
      // to bundle, not at node_modules. Skip them so esbuild's alias
      // resolution applies and the resolved path gets bundled normally.
      if (
        args.path.startsWith("@app/") ||
        args.path.startsWith("@front-api/")
      ) {
        return;
      }
      const pkg = args.path.startsWith("@")
        ? args.path.split("/").slice(0, 2).join("/")
        : args.path.split("/")[0];
      if (ESM_ONLY_PACKAGES.includes(pkg)) {
        return;
      }
      return { external: true };
    });
  },
};

export interface BuildTarget {
  name: string;
  entry: string;
  outfile: string;
}

// server.ts is the Hono-only runtime target (`npm start` in this workspace).
export const BUILD_TARGETS: BuildTarget[] = [
  { name: "server", entry: "server.ts", outfile: "dist/server.js" },
  { name: "migrate", entry: "scripts/migrate.ts", outfile: "dist/migrate.js" },
  {
    name: "collab",
    entry: "collab_server.ts",
    outfile: "dist/collab_server.js",
  },
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
    plugins: [bundleEsmPlugin, linguiPlugin],
    logLevel: "info",
    metafile: true,
    minifyIdentifiers: false,
    treeShaking: true,
    jsx: "automatic",
  };
}

// Environment for a dev server child process.
//
// Externalized requires resolve relative to the bundle's directory, but
// most runtime deps live under `front/node_modules` (front-api itself
// declares almost nothing). The Dockerfile sets the same NODE_PATH at
// runtime (see dockerfiles/front.Dockerfile, "ENV NODE_PATH=/app/front/node_modules").
const FRONT_NODE_MODULES = "../front/node_modules";

export function childEnv(): NodeJS.ProcessEnv {
  const existing = process.env.NODE_PATH;
  return {
    ...process.env,
    NODE_PATH: existing
      ? `${FRONT_NODE_MODULES}:${existing}`
      : FRONT_NODE_MODULES,
    // V8 compile cache persists across restarts (Node >= 22.8). Each child
    // reuses the parsed/compiled bytecode of the 6 MB bundle from disk,
    // cutting cold-parse cost out of every dev rebuild.
    NODE_COMPILE_CACHE:
      process.env.NODE_COMPILE_CACHE ?? ".cache/node-compile-cache",
  };
}
