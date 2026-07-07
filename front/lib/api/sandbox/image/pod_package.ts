import { spawnSync } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

// @dust/pod is the pod-state runtime package (db(name) over bun:sqlite; see
// design_docs/pod_state_progress/contracts/paths-env.v1.md). Its source lives
// as a standalone bun package in cli/dust-sandbox/pod. The @dust scope is a
// Dust-owned virtual namespace that is never published to npm, so the package
// is vendored into the image at build time: bun-bundle the entrypoint
// (packages stay external and resolve through NODE_PATH at invocation, like
// zod) and copy a flat {package.json, index.js} into
// /opt/npm-global/lib/node_modules/@dust/pod.
// __dirname is front/lib/api/sandbox/image → 4 up is front, 5 up is the repo
// root (compare FRONT_ROOT_DIR in image/profile/build.ts, which is 5 up from
// one directory deeper). Pinned by pod_package.test.ts against repo-root
// markers so an off-by-one cannot silently point outside the repo.
const REPO_ROOT_DIR = path.resolve(__dirname, "../../../../..");
export const POD_PACKAGE_SRC_DIR = path.join(
  REPO_ROOT_DIR,
  "cli/dust-sandbox/pod"
);
const POD_PACKAGE_ENTRYPOINT = path.join(POD_PACKAGE_SRC_DIR, "index.ts");
const POD_PACKAGE_CACHE = new Map<string, Map<string, Buffer | string>>();

export const POD_PACKAGE_NAME = "@dust/pod";
export const POD_PACKAGE_VERSION = "0.1.0";
export const POD_PACKAGE_IMAGE_DIR = `/opt/npm-global/lib/node_modules/${POD_PACKAGE_NAME}`;

function isENOENT(err: Error | undefined): err is NodeJS.ErrnoException {
  return err !== undefined && "code" in err && err.code === "ENOENT";
}

function walkFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") {
          return [];
        }
        return walkFiles(entryPath);
      }
      return [entryPath];
    })
    .sort();
}

function getPodPackageBuildHash(): string {
  const hash = createHash("sha256");
  for (const filePath of walkFiles(POD_PACKAGE_SRC_DIR)) {
    hash.update(path.relative(POD_PACKAGE_SRC_DIR, filePath));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
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
  // The source dir is written by a parallel track (pod 1); the path is
  // contract-frozen. This generator only runs at image build time (content
  // generators are lazy), so a missing dir must fail the build loudly rather
  // than ship an image without the package.
  if (!fs.existsSync(POD_PACKAGE_ENTRYPOINT)) {
    throw new Error(
      `@dust/pod source not found at ${POD_PACKAGE_ENTRYPOINT}. The package ` +
        "lives in cli/dust-sandbox/pod (see " +
        "design_docs/pod_state_progress/contracts/paths-env.v1.md)."
    );
  }

  const buildHash = getPodPackageBuildHash();
  const cached = POD_PACKAGE_CACHE.get(buildHash);
  if (cached) {
    return cached;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dust-pod-build-"));
  const outputPath = path.join(tempDir, "index.js");

  try {
    const result = spawnSync(
      "bun",
      [
        "build",
        POD_PACKAGE_ENTRYPOINT,
        "--bundle",
        "--target=bun",
        "--packages=external",
        "--outfile",
        outputPath,
      ],
      {
        cwd: POD_PACKAGE_SRC_DIR,
        encoding: "utf8",
      }
    );

    if (isENOENT(result.error)) {
      throw new Error(
        "bun is required to build the sandbox @dust/pod package, but it was not found on PATH"
      );
    }

    if (result.status !== 0) {
      throw new Error(
        `Failed to build sandbox @dust/pod package with bun: ${
          result.stderr || result.stdout || "unknown error"
        }`
      );
    }

    const bundle = fs.readFileSync(outputPath);
    const files = new Map<string, Buffer | string>([
      ["package.json", buildPackageJson()],
      ["index.js", bundle],
    ]);
    POD_PACKAGE_CACHE.set(buildHash, files);
    return files;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
