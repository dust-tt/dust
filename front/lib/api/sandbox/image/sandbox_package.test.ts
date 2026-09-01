import { existsSync } from "node:fs";
import path from "node:path";
import {
  getSandboxPackageSrcDir,
  LEGACY_POD_PACKAGE_IMAGE_DIR,
  SANDBOX_PACKAGE_IMAGE_DIR,
} from "@app/lib/api/sandbox/image/sandbox_package";
import { describe, expect, test } from "vitest";

describe("sandbox package build paths", () => {
  test("resolves the @dust/sandbox source dir under the repo root", () => {
    // Assert the walk through stable repo-root markers instead of its number
    // of parent directories.
    const srcDir = getSandboxPackageSrcDir();
    const repoRoot = path.dirname(path.dirname(path.dirname(srcDir)));

    expect(srcDir.endsWith("cli/dust-sandbox/pod")).toBe(true);
    expect(existsSync(path.join(repoRoot, "front", "package.json"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "cli", "dust-sandbox"))).toBe(true);
  });

  test("targets the @dust scope inside the global node_modules", () => {
    expect(SANDBOX_PACKAGE_IMAGE_DIR).toBe(
      "/opt/npm-global/lib/node_modules/@dust/sandbox"
    );
    expect(LEGACY_POD_PACKAGE_IMAGE_DIR).toBe(
      "/opt/npm-global/lib/node_modules/@dust/pod"
    );
  });
});
