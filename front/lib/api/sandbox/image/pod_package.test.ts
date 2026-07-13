import { existsSync } from "node:fs";
import path from "node:path";
import {
  getPodPackageSrcDir,
  POD_PACKAGE_IMAGE_DIR,
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
});
