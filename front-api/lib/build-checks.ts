import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { Metafile } from "esbuild";

import { EXTERNAL_PACKAGES } from "../esbuild.shared";

const NODE_MODULES = "node_modules/";

// Browser-only packages. One value import from a server module is enough to pull
// any of these into the bundle, and they are pure startup cost there.
const BROWSER_ONLY_PACKAGES = [
  "@datadog/browser-core",
  "@datadog/browser-logs",
  "@datadog/browser-rum",
  "@dust-tt/sparkle",
  "@tiptap/react",
  "next",
  "posthog-js",
  "swr",
];

// react-dom is deliberately absent: @react-email/render uses react-dom/server to
// render the notification email templates, which is a server API.

function packageOf(inputPath: string): string | null {
  const index = inputPath.lastIndexOf(NODE_MODULES);
  if (index < 0) {
    return null;
  }
  const parts = inputPath.slice(index + NODE_MODULES.length).split("/");
  return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

export function bundledPackages(metafile: Metafile): Set<string> {
  const packages = new Set<string>();
  for (const input of Object.keys(metafile.inputs)) {
    const name = packageOf(input);
    if (name) {
      packages.add(name);
    }
  }
  return packages;
}

// dd-trace names each instrumentation file after the module it hooks. Reading
// that directory is how we notice it started instrumenting something we bundle:
// a bundled module never goes through require, so its spans silently disappear.
function ddTraceInstrumentedPackages(): string[] {
  const require = createRequire(import.meta.url);
  const dir = join(
    dirname(require.resolve("dd-trace/package.json")),
    "packages/datadog-instrumentations/src"
  );
  const names = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".js")) {
      continue;
    }
    const source = readFileSync(join(dir, file), "utf8");
    for (const match of source.matchAll(/name: ['"]([^'"]+)['"]/g)) {
      names.add(match[1]);
    }
  }
  return [...names];
}

/**
 * Fails the build when the bundle swallows something that has to stay a real
 * module, or something that has no business running on a server at all.
 */
export function checkBundleContents(metafile: Metafile): string[] {
  const bundled = bundledPackages(metafile);
  const problems: string[] = [];

  for (const name of BROWSER_ONLY_PACKAGES) {
    if (bundled.has(name)) {
      problems.push(
        `${name} is browser-only and must not be reachable from front-api.`
      );
    }
  }

  const instrumented = ddTraceInstrumentedPackages();
  // `lodash` and `cookie` are hooked for taint tracking, not spans.
  const spanless = new Set(["cookie", "lodash"]);
  for (const name of instrumented) {
    if (bundled.has(name) && !spanless.has(name)) {
      problems.push(
        `${name} is instrumented by dd-trace but was bundled, which drops its APM spans. Add it to DD_TRACE_INSTRUMENTED_PACKAGES.`
      );
    }
  }

  const unused = EXTERNAL_PACKAGES.filter(
    (name) => !name.includes("*") && bundled.has(name)
  );
  if (unused.length > 0) {
    problems.push(
      `Listed as external but bundled anyway (stale entry?): ${unused.join(", ")}`
    );
  }

  return problems;
}
