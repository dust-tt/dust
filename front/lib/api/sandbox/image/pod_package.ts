import { runCachedBunBuild } from "@app/lib/api/sandbox/image/bun_build";
import fs from "fs";
import path from "path";

// @dust/pod is the pod-state runtime package exposed to sandbox function
// code: db(name) returns a handle on one of the pod's SQLite databases
// (bun:sqlite). The @dust scope is never published to npm, so the package is
// vendored at image build time: bun-bundle the entrypoint (dependencies stay
// external and resolve through NODE_PATH, like zod) and copy a flat
// {package.json, index.js} into the image's global node_modules.
export const POD_PACKAGE_NAME = "@dust/pod";
export const POD_PACKAGE_VERSION = "0.3.0";
export const POD_PACKAGE_IMAGE_DIR = `/opt/npm-global/lib/node_modules/${POD_PACKAGE_NAME}`;

let podPackageSrcDir: string | undefined;

/**
 * The @dust/pod source lives at cli/dust-sandbox/pod, resolved by walking up
 * from this file to the first ancestor containing cli/dust-sandbox instead of
 * counting `..` segments. Lazy on purpose: the repo layout exists where
 * images are built, not necessarily where front is deployed.
 */
export function getPodPackageSrcDir(): string {
  if (podPackageSrcDir) {
    return podPackageSrcDir;
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

  podPackageSrcDir = path.join(dir, "cli", "dust-sandbox", "pod");
  return podPackageSrcDir;
}

function buildPackageJson(): string {
  return `${JSON.stringify(
    {
      name: POD_PACKAGE_NAME,
      version: POD_PACKAGE_VERSION,
      private: true,
      type: "module",
      main: "index.js",
    },
    null,
    2
  )}\n`;
}

export function buildPodPackage(): Map<string, Buffer | string> {
  const srcDir = getPodPackageSrcDir();
  const entrypoint = path.join(srcDir, "index.ts");

  // The source dir lands in a parallel PR. This generator only runs at image
  // build time (content generators are lazy), so a missing dir must fail the
  // build loudly rather than ship an image without the package.
  if (!fs.existsSync(entrypoint)) {
    throw new Error(`@dust/pod source not found at ${entrypoint}`);
  }

  return new Map<string, Buffer | string>([
    ["package.json", buildPackageJson()],
    [
      "index.js",
      runCachedBunBuild({
        name: "the sandbox @dust/pod package",
        entrypoint,
        srcDir,
        cwd: srcDir,
        bunArgs: ["--bundle", "--target=bun", "--packages=external"],
      }),
    ],
  ]);
}
