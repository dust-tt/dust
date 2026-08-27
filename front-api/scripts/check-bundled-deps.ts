import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";

import esbuild from "esbuild";

import {
  BUILD_TARGETS,
  type BuildTarget,
  getBaseBuildOptions,
} from "../esbuild.shared";

// esbuild externalizes every bare-specifier import by default (see
// `bundleEsmPlugin` in esbuild.shared.ts), including ones reached only
// through the `@app/*` alias into `front`'s source. Those `require()` calls
// are resolved by Node from front-api's own node_modules at runtime, so an
// externalized package that isn't a declared front-api dependency instead
// resolves by walking up to whatever happens to be hoisted at the repo
// root, which can differ between install layouts (see #31284, where a
// missing `openai` entry worked in prod but resolved a stale, incompatible
// version locally).
//
// front-api bundles most of `front`'s route/model code, so a large set of
// packages are already externalized this way without being declared here —
// `BASELINE_ALLOWLIST_PATH` grandfathers today's list so this check can
// land without forcing an immediate mass dependency migration. It should
// not grow: prefer declaring a new dependency directly in this package's
// `dependencies` over adding it to the allowlist.
const PACKAGE_JSON_PATH = "package.json";
const BASELINE_ALLOWLIST_PATH = "scripts/check-bundled-deps.allowlist.json";

function packageNameFromImportPath(importPath: string): string {
  const parts = importPath.split("/");
  return importPath.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

async function findUndeclaredExternalDeps(
  target: BuildTarget,
  declaredDeps: Set<string>
): Promise<string[]> {
  const result = await esbuild.build({
    ...getBaseBuildOptions(target),
    write: false,
  });

  const output = result.metafile?.outputs[target.outfile];
  if (!output) {
    throw new Error(`esbuild produced no metafile output for ${target.name}`);
  }

  const externalPackages = new Set(
    output.imports
      .filter((imp) => imp.external)
      .map((imp) => packageNameFromImportPath(imp.path))
      .filter((pkg) => !builtinModules.includes(pkg.replace(/^node:/, "")))
  );

  return [...externalPackages]
    .filter((pkg) => !declaredDeps.has(pkg))
    .sort();
}

async function main() {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf-8"));
  const declaredDeps = new Set(Object.keys(packageJson.dependencies ?? {}));
  const baselineAllowlist: string[] = JSON.parse(
    readFileSync(BASELINE_ALLOWLIST_PATH, "utf-8")
  );
  const accepted = new Set([...declaredDeps, ...baselineAllowlist]);

  const results = await Promise.all(
    BUILD_TARGETS.map(async (target) => ({
      target: target.name,
      undeclared: await findUndeclaredExternalDeps(target, accepted),
    }))
  );

  const failures = results.filter((result) => result.undeclared.length > 0);

  if (failures.length > 0) {
    console.error(
      "The following packages are require()'d at runtime by the bundled\n" +
        "front-api output but are not declared in front-api/package.json's\n" +
        `\`dependencies\` and are not in ${BASELINE_ALLOWLIST_PATH}.\n` +
        "Declare each one explicitly in front-api's `dependencies` so it\n" +
        "resolves from front-api's own node_modules instead of depending\n" +
        "on hoisting:\n"
    );
    for (const { target, undeclared } of failures) {
      console.error(`  ${target}: ${undeclared.join(", ")}`);
    }
    process.exit(1);
  }

  console.log(
    "✅ All externalized runtime imports are declared as front-api dependencies or baselined."
  );
}

main().catch((error) => {
  console.error("❌ check-bundled-deps failed:", error);
  process.exit(1);
});
