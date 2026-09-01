import { runCachedBunBuild } from "@app/lib/api/sandbox/image/bun_build";
import fs from "fs";
import path from "path";

// @dust/sandbox is the sandbox-state runtime package exposed to sandbox function
// code: db(name) returns a handle on one of the owner's SQLite databases
// (bun:sqlite). The @dust scope is never published to npm, so the package is
// vendored at image build time: bun-bundle the entrypoint (dependencies stay
// external and resolve through NODE_PATH, like zod) and copy a flat
// {package.json, index.js} into the image's global node_modules.
export const SANDBOX_PACKAGE_NAME = "@dust/sandbox";
export const SANDBOX_PACKAGE_VERSION = "0.3.3";
export const SANDBOX_PACKAGE_IMAGE_DIR = `/opt/npm-global/lib/node_modules/${SANDBOX_PACKAGE_NAME}`;
export const LEGACY_POD_PACKAGE_NAME = "@dust/pod";
export const LEGACY_POD_PACKAGE_IMAGE_DIR = `/opt/npm-global/lib/node_modules/${LEGACY_POD_PACKAGE_NAME}`;

let sandboxPackageSrcDir: string | undefined;

/**
 * The @dust/sandbox source lives at cli/dust-sandbox/pod, resolved by walking up
 * from this file to the first ancestor containing cli/dust-sandbox instead of
 * counting `..` segments. Lazy on purpose: the repo layout exists where
 * images are built, not necessarily where front is deployed.
 */
export function getSandboxPackageSrcDir(): string {
  if (sandboxPackageSrcDir) {
    return sandboxPackageSrcDir;
  }

  let dir = __dirname;
  while (!fs.existsSync(path.join(dir, "cli", "dust-sandbox"))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not resolve the repo root: no ancestor of ${__dirname} contains cli/dust-sandbox`
      );
    }
    dir = parent;
  }

  sandboxPackageSrcDir = path.join(dir, "cli", "dust-sandbox", "pod");
  return sandboxPackageSrcDir;
}

function buildPackageJson(): string {
  return `${JSON.stringify(
    {
      name: SANDBOX_PACKAGE_NAME,
      version: SANDBOX_PACKAGE_VERSION,
      private: true,
      type: "module",
      main: "index.js",
    },
    null,
    2
  )}\n`;
}

export function buildSandboxPackage(): Map<string, Buffer | string> {
  const srcDir = getSandboxPackageSrcDir();
  const entrypoint = path.join(srcDir, "index.ts");

  // Content generators are lazy and run only at image build time, so a
  // missing entrypoint must fail loudly rather than ship an incomplete image.
  if (!fs.existsSync(entrypoint)) {
    throw new Error(`@dust/sandbox source not found at ${entrypoint}`);
  }

  return new Map<string, Buffer | string>([
    ["package.json", buildPackageJson()],
    [
      "index.js",
      runCachedBunBuild({
        name: "the @dust/sandbox package",
        entrypoint,
        srcDir,
        cwd: srcDir,
        bunArgs: ["--bundle", "--target=bun", "--packages=external"],
      }),
    ],
  ]);
}
