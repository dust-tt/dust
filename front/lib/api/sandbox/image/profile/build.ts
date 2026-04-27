import { spawnSync } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const PROFILE_LOCAL_DIR = __dirname;
const PROFILE_SRC_DIR = path.join(PROFILE_LOCAL_DIR, "src");
const FRONT_ROOT_DIR = path.resolve(__dirname, "../../../../..");
const DUST_TOOLS_ENTRYPOINT = path.join(PROFILE_SRC_DIR, "index.ts");
const DUST_TOOLS_BINARY_CACHE = new Map<string, Buffer>();

function isENOENT(err: Error | undefined): err is NodeJS.ErrnoException {
  return err !== undefined && "code" in err && err.code === "ENOENT";
}

function walkFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(entryPath);
      }
      return [entryPath];
    })
    .sort();
}

function getDustToolsBuildHash(): string {
  const hash = createHash("sha256");
  const files = [
    ...walkFiles(PROFILE_SRC_DIR),
    path.join(FRONT_ROOT_DIR, "package.json"),
  ];

  for (const filePath of files) {
    hash.update(path.relative(FRONT_ROOT_DIR, filePath));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }

  return hash.digest("hex");
}

export function buildDustToolsBinary(): Buffer {
  const buildHash = getDustToolsBuildHash();
  const cached = DUST_TOOLS_BINARY_CACHE.get(buildHash);
  if (cached) {
    return cached;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dust-tools-build-"));
  const outputPath = path.join(tempDir, "dust-tools");

  try {
    const result = spawnSync(
      "bun",
      [
        "build",
        "--compile",
        "--target=bun-linux-x64",
        DUST_TOOLS_ENTRYPOINT,
        "--outfile",
        outputPath,
      ],
      {
        cwd: FRONT_ROOT_DIR,
        encoding: "utf8",
      }
    );

    if (isENOENT(result.error)) {
      throw new Error(
        "bun is required to build the sandbox dust-tools binary, but it was not found on PATH"
      );
    }

    if (result.status !== 0) {
      throw new Error(
        `Failed to build sandbox dust-tools binary with bun: ${
          result.stderr || result.stdout || "unknown error"
        }`
      );
    }

    const binary = fs.readFileSync(outputPath);
    DUST_TOOLS_BINARY_CACHE.set(buildHash, binary);
    return binary;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
