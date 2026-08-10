// `dsbx db schema` runner backend: regenerate a drizzle `{db}.db.ts` schema file from a live pod
// database by delegating to drizzle-kit's own `pull`.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Err, Ok, type Result } from "#result.ts";
import { DbCommandError } from "./common.ts";

export function generateSchemaFileText(
  dbPath: string
): Result<string, DbCommandError> {
  if (!existsSync(dbPath)) {
    return new Err(
      new DbCommandError(
        "database_not_found",
        `cannot open database at ${dbPath}; it is created by the first reconcile that claims it`
      )
    );
  }

  // Pull into a throwaway directory: drizzle-kit writes several files there, and running in it
  // keeps a stray drizzle.config in the caller's CWD from being picked up.
  const outDir = mkdtempSync(join(tmpdir(), "dsbx-schema-"));
  try {
    // Run the drizzle-kit CLI *under bun* rather than invoking it directly: its bin carries a
    // `#!/usr/bin/env node` shebang, and the sandbox image ships bun but no `node`, so a bare
    // spawn dies with "env: 'node': No such file or directory". Passing the resolved bin as a
    // bun argument bypasses the shebang (reconcile avoids this by using drizzle-kit's JS API).
    const drizzleKitBin = drizzleKitBinPath();
    if (drizzleKitBin.isErr()) {
      return drizzleKitBin;
    }
    const pull = Bun.spawnSync(
      [
        "bun",
        drizzleKitBin.value,
        "pull",
        "--dialect=sqlite",
        `--out=${outDir}`,
        `--url=file:${dbPath}`,
      ],
      { cwd: outDir, env: drizzleKitEnv(), stdout: "pipe", stderr: "pipe" }
    );
    if (pull.exitCode !== 0) {
      // Surface drizzle-kit's own diagnostic; it prints progress to stdout and errors to either
      // stream, so return whichever carried the failure.
      const detail =
        pull.stderr.toString().trim() ||
        pull.stdout.toString().trim() ||
        `exit code ${pull.exitCode}`;
      return new Err(
        new DbCommandError("internal", `drizzle-kit pull failed: ${detail}`)
      );
    }

    const schemaPath = join(outDir, "schema.ts");
    if (!existsSync(schemaPath)) {
      return new Err(
        new DbCommandError(
          "internal",
          `drizzle-kit pull wrote no schema file to ${outDir}`
        )
      );
    }
    return new Ok(readFileSync(schemaPath, "utf8"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

// Where the sandbox image installs drizzle-kit (root-owned `npm install -g` at image
// build). Hardened sandbox exec runs with a pinned PATH that deliberately excludes
// /opt/npm-global/bin, so runtime resolution must not go through PATH — login shells
// source the profile and see a wider PATH, which makes PATH-based failures here
// especially confusing to debug.
const SANDBOX_DRIZZLE_KIT_BIN = "/opt/npm-global/bin/drizzle-kit";

// Dev/test install: drizzle-kit is a devDependency of this package.
const LOCAL_DRIZZLE_KIT_BIN = join(
  import.meta.dir,
  "..",
  "node_modules",
  ".bin",
  "drizzle-kit"
);

// Spawn env for the drizzle-kit child; prepending the local .bin keeps any
// sub-resolutions it does working in dev, where nothing is globally installed.
function drizzleKitEnv(): Record<string, string | undefined> {
  const localBin = join(import.meta.dir, "..", "node_modules", ".bin");
  return { ...process.env, PATH: `${localBin}:${process.env.PATH ?? ""}` };
}

// Resolve drizzle-kit by explicit path only — never through the caller's PATH.
// Image install first: on the sandbox it's a root-owned constant, and preferring
// it keeps production resolution independent of whatever sits next to the
// deployed bundle. The local .bin only exists on dev machines and CI.
export function resolveDrizzleKitBin({
  imageBin,
  localBin,
}: {
  imageBin: string;
  localBin: string;
}): Result<string, DbCommandError> {
  if (existsSync(imageBin)) {
    return new Ok(imageBin);
  }
  if (existsSync(localBin)) {
    return new Ok(localBin);
  }
  return new Err(
    new DbCommandError(
      "internal",
      `drizzle-kit not found; checked ${imageBin} and ${localBin}`
    )
  );
}

function drizzleKitBinPath(): Result<string, DbCommandError> {
  return resolveDrizzleKitBin({
    imageBin: SANDBOX_DRIZZLE_KIT_BIN,
    localBin: LOCAL_DRIZZLE_KIT_BIN,
  });
}
