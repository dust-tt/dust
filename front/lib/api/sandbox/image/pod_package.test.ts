import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  getPodPackageSrcDir,
  POD_PACKAGE_IMAGE_DIR,
  POD_PACKAGE_NAME,
  POD_PACKAGE_VERSION,
} from "@app/lib/api/sandbox/image/pod_package";
import { describe, expect, test } from "vitest";

describe("pod package build paths", () => {
  test("resolves the @dust/pod source dir under the repo root", () => {
    // cli/dust-sandbox/pod itself lands in a parallel stack, so assert the
    // resolution through markers that exist in every checkout: the repo root
    // must contain front/ (where this test runs from) and cli/dust-sandbox/
    // (the parent of the pod package).
    const srcDir = getPodPackageSrcDir();
    // pod → dust-sandbox → cli → repo root.
    const repoRoot = path.dirname(path.dirname(path.dirname(srcDir)));

    expect(srcDir.endsWith("cli/dust-sandbox/pod")).toBe(true);
    expect(existsSync(path.join(repoRoot, "front", "package.json"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "cli", "dust-sandbox"))).toBe(true);
  });

  test("targets the @dust scope inside the global node_modules", () => {
    expect(POD_PACKAGE_IMAGE_DIR).toBe(
      "/opt/npm-global/lib/node_modules/@dust/pod"
    );
  });

  // The image gets a synthesised package.json built from these constants, not a copy of the
  // real one, because `registry.ts` reads them while building `DUST_BASE_IMAGE` at module load
  // — where the repo layout may be absent. They are therefore a deliberate duplicate of the
  // source package's own fields, and nothing but this test keeps the two in step.
  test("declares the version the @dust/pod source actually ships", () => {
    const manifest: unknown = JSON.parse(
      readFileSync(path.join(getPodPackageSrcDir(), "package.json"), "utf-8")
    );

    expect(manifest).toMatchObject({
      name: POD_PACKAGE_NAME,
      version: POD_PACKAGE_VERSION,
    });
  });
});
