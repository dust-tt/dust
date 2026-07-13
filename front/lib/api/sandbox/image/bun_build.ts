import { spawnSync } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const BUN_BUILD_CACHE = new Map<string, Buffer>();

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

function getSourceHash(srcDir: string, extraFiles: readonly string[]): string {
  const hash = createHash("sha256");
  for (const filePath of [...walkFiles(srcDir), ...extraFiles]) {
    hash.update(path.relative(srcDir, filePath));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

interface BunBuildOptions {
  /** Artifact name used in error messages, e.g. "the sandbox dust-tools binary". */
  name: string;
  entrypoint: string;
  /** Source directory whose content (with extraHashFiles) forms the cache key. */
  srcDir: string;
  /** Files outside srcDir that must invalidate the cache, e.g. a package.json. */
  extraHashFiles?: readonly string[];
  cwd: string;
  /** `bun build` flags, e.g. --compile or --bundle plus their targets. */
  bunArgs: readonly string[];
}

/**
 * Runs `bun build` on the entrypoint and returns the output file, cached per
 * process on a content hash of the sources so repeated image builds do not
 * rebuild unchanged artifacts.
 */
export function runCachedBunBuild({
  name,
  entrypoint,
  srcDir,
  extraHashFiles = [],
  cwd,
  bunArgs,
}: BunBuildOptions): Buffer {
  const cacheKey = `${name}:${getSourceHash(srcDir, extraHashFiles)}`;
  const cached = BUN_BUILD_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dust-bun-build-"));
  const outputPath = path.join(tempDir, "output");

  try {
    const result = spawnSync(
      "bun",
      ["build", ...bunArgs, entrypoint, "--outfile", outputPath],
      { cwd, encoding: "utf8" }
    );

    if (isENOENT(result.error)) {
      throw new Error(
        `bun is required to build ${name}, but it was not found on PATH`
      );
    }

    if (result.status !== 0) {
      throw new Error(
        `Failed to build ${name} with bun: ${
          result.stderr || result.stdout || "unknown error"
        }`
      );
    }

    const output = fs.readFileSync(outputPath);
    BUN_BUILD_CACHE.set(cacheKey, output);
    return output;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
