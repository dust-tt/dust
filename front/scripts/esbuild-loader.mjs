// Node module customization hooks that let `node` run our TypeScript scripts
// without `tsx`. They cover the two things plain Node lacks:
//   1. Resolving the `@app/*` tsconfig path alias and extensionless imports.
//   2. Transforming TypeScript (types, enums, ...) via the already-present esbuild.
//
// Registered from `register-esbuild.mjs` and used e.g. by `npm run debug:profiler`.
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";

// `@app/*` maps to the front root (`./*` per tsconfig baseUrl). This file lives
// in `front/scripts/`, so the front root is one directory up.
const FRONT_ROOT = new URL("../", import.meta.url);

const RESOLVE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

function probe(targetUrl) {
  const basePath = fileURLToPath(targetUrl);
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = basePath + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let targetUrl = null;
  if (specifier.startsWith("@app/")) {
    targetUrl = new URL(specifier.slice("@app/".length), FRONT_ROOT);
  } else if (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("file:")
  ) {
    targetUrl = new URL(specifier, context.parentURL);
  }

  if (targetUrl) {
    const found = probe(targetUrl);
    if (found) {
      return { url: found, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    const { code } = await transform(source, {
      loader: url.endsWith(".tsx") ? "tsx" : "ts",
      format: "esm",
      target: "esnext",
      sourcemap: "inline",
      sourcefile: fileURLToPath(url),
    });
    return { format: "module", source: code, shortCircuit: true };
  }

  return nextLoad(url, context);
}
