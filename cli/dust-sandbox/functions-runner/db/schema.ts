// `dsbx db schema` runner backend: regenerate a drizzle `{db}.db.ts` schema file from a live pod
// database by delegating to drizzle-kit's own `pull`.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Err, Ok, type Result } from "../result.ts";
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

// drizzle-kit is a CLI on PATH in the sandbox image (global install). In tests it is only a
// devDependency, so prepend this package's node_modules/.bin so the same spawn resolves it there.
function drizzleKitEnv(): Record<string, string | undefined> {
  const localBin = join(import.meta.dir, "..", "node_modules", ".bin");
  return { ...process.env, PATH: `${localBin}:${process.env.PATH ?? ""}` };
}

// Resolve the drizzle-kit bin against the same PATH the spawn uses (global install on the
// sandbox, local .bin in tests), so it can be handed to bun as a script path.
function drizzleKitBinPath(): Result<string, DbCommandError> {
  const bin = Bun.which("drizzle-kit", { PATH: drizzleKitEnv().PATH });
  if (!bin) {
    return new Err(
      new DbCommandError("internal", "drizzle-kit not found on PATH")
    );
  }
  return new Ok(bin);
}
