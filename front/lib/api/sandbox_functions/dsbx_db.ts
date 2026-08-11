import { randomUUID } from "node:crypto";
import path from "node:path";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system/types";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/lib/api/files/mount_path";
import { getRedisStreamClient } from "@app/lib/api/redis";
import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import {
  podDatabasePrefixFromPodPath,
  resolvePodDatabaseName,
} from "@app/lib/api/sandbox_functions/db_naming";
import type {
  LiveDatabaseEntry,
  ReconcileDatabaseResult,
} from "@app/lib/api/sandbox_functions/dsbx_db_on_sandbox";
import {
  DSBX_BIN_PATH,
  dbErrorEnvelopeSchema,
  dbErrorToSandboxFunctionError,
  execDbCommandOnSandbox,
  listPodDatabases,
  reconcileDatabaseOnSandbox,
} from "@app/lib/api/sandbox_functions/dsbx_db_on_sandbox";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { StagingHashes } from "@app/lib/api/sandbox_functions/staging_integrity";
import {
  stagingHashCaptureLines,
  verifyStagingContent,
} from "@app/lib/api/sandbox_functions/staging_integrity";
import type { Authenticator } from "@app/lib/auth";
import { distributedLock, distributedUnlock } from "@app/lib/lock";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import tracer from "@app/logger/tracer";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

export type { LiveDatabaseEntry, ReconcileDatabaseResult };

/**
 * Pod-level `dsbx db` entry points: ensure the pod sandbox is ready, then run the sandbox-level
 * command from `dsbx_db_on_sandbox.ts`. Everything model-facing (the db_* tools, publish) goes
 * through here so a cold pod is brought up transparently.
 */

/** Ensure the pod sandbox is ready and return it, mapping failure to sandbox_unavailable. */
async function ensureSandboxForDb(
  auth: Authenticator,
  space: SpaceResource
): Promise<Result<SandboxResource, SandboxFunctionError>> {
  const ensureResult = await ensurePodSandboxReady(auth, space);
  if (ensureResult.isErr()) {
    return new Err(
      new SandboxFunctionError(
        "sandbox_unavailable",
        ensureResult.error.message
      )
    );
  }
  return new Ok(ensureResult.value.sandbox);
}

// Ensure the pod sandbox is up, run a `dsbx db` command as agent-proxied, and parse its one-line
// JSON envelope. Returns the sandbox too, since `db schema` reads a file back afterwards.
async function execDbCommand<S extends z.ZodTypeAny>(
  auth: Authenticator,
  space: SpaceResource,
  opts: {
    command: string;
    schema: S;
    what: string;
    envVars?: Record<string, string>;
    stdin?: string;
    // Set only when `command` appends stagingHashCaptureLines.
    stagingCapture?: boolean;
  }
): Promise<
  Result<
    {
      sandbox: SandboxResource;
      envelope: z.infer<S>;
      stagingHashes: StagingHashes;
      execStderr: string;
    },
    SandboxFunctionError
  >
> {
  const sandboxResult = await ensureSandboxForDb(auth, space);
  if (sandboxResult.isErr()) {
    return sandboxResult;
  }
  const sandbox = sandboxResult.value;

  const result = await execDbCommandOnSandbox(auth, sandbox, opts);
  if (result.isErr()) {
    return result;
  }
  return new Ok({ sandbox, ...result.value });
}

const RECONCILE_LOCK_ACQUIRE_TIMEOUT_MS = 30_000;

/**
 * Resolve a model-supplied scoped schema-file path (e.g. `pod-{id}/MyApp/databases/chat.db.ts`) to
 * its in-sandbox path and reconcile against it. The only path that applies schema changes to a live
 * database (publish validates but never applies); concurrent reconciles of one pod are serialized
 * under a per-pod lock.
 *
 * `database` is the app-relative name the schema file declares (`chat`); the on-disk name is that
 * name qualified with the app prefix taken from the schema file's own app folder. The live database
 * set is read inside the lock, because which name wins depends on what already exists (see
 * resolvePodDatabaseName) and a concurrent reconcile could otherwise create it in between.
 */
export async function reconcileDatabaseFromPodPath(
  auth: Authenticator,
  {
    space,
    database,
    path: scopedPath,
  }: { space: SpaceResource; database: string; path: string }
): Promise<Result<ReconcileDatabaseResult, SandboxFunctionError>> {
  const fsResult = await DustFileSystem.forPod(auth, space);
  if (fsResult.isErr()) {
    return new Err(
      new SandboxFunctionError("invalid_path", fsResult.error.message)
    );
  }
  const resolved = fsResult.value.toSandboxPath(scopedPath);
  if (resolved.isErr()) {
    return new Err(
      new SandboxFunctionError("invalid_path", resolved.error.message)
    );
  }

  const prefixResult = podDatabasePrefixFromPodPath({
    sourcePath: scopedPath,
    podId: space.sId,
  });
  if (prefixResult.isErr()) {
    return new Err(
      new SandboxFunctionError("invalid_path", prefixResult.error.message)
    );
  }
  const prefix = prefixResult.value;

  // Acquire the per-pod lock directly (not via executeWithLock) so a timeout surfaces as a
  // retryable publish_conflict Result instead of a thrown error.
  const client = await getRedisStreamClient({ origin: "lock" });
  const lockName = `sandbox_function:db_reconcile:${space.sId}`;
  const lockValue = await tracer.trace(
    "lock.acquire",
    { resource: "sandbox_function.db_reconcile" },
    async () => {
      const startMs = Date.now();
      while (Date.now() - startMs < RECONCILE_LOCK_ACQUIRE_TIMEOUT_MS) {
        const acquired = await distributedLock(client, lockName);
        if (acquired) {
          return acquired;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return undefined;
    }
  );
  if (!lockValue) {
    return new Err(
      new SandboxFunctionError(
        "publish_conflict",
        "Another reconcile is in progress for this pod; retry shortly."
      )
    );
  }
  try {
    const sandboxResult = await ensureSandboxForDb(auth, space);
    if (sandboxResult.isErr()) {
      return sandboxResult;
    }
    const sandbox = sandboxResult.value;

    const existingResult = await listPodDatabases(auth, { sandbox });
    if (existingResult.isErr()) {
      return new Err(existingResult.error);
    }

    return await reconcileDatabaseOnSandbox(auth, {
      sandbox,
      podId: space.sId,
      database: resolvePodDatabaseName({
        prefix,
        name: database,
        existingNames: existingResult.value.map((entry) => entry.name),
      }),
      schemaFileSandboxPath: resolved.value,
    });
  } finally {
    await distributedUnlock(client, lockName, lockValue);
  }
}

/** `dsbx db list`: enumerate the live `{db}.db` files with their sizes (WAL included). */
export async function listDatabasesOnSandbox(
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<Result<LiveDatabaseEntry[], SandboxFunctionError>> {
  const sandboxResult = await ensureSandboxForDb(auth, space);
  if (sandboxResult.isErr()) {
    return sandboxResult;
  }
  return listPodDatabases(auth, { sandbox: sandboxResult.value });
}

// `dsbx db schema` writes the regenerated file and prints only `{ok}`.
const schemaEnvelopeSchema = z.union([
  z.object({ ok: z.literal(true) }),
  dbErrorEnvelopeSchema,
]);

// Non-mounted scratch root for regenerated schema files (cf. BUILD_STAGING_ROOT).
const DB_SCHEMA_STAGING_ROOT = "/tmp/dust-sandbox-db-schemas";

/**
 * `dsbx db schema`: regenerate a drizzle schema file from the live database and read its text
 * back. SQLite does not store column modes, so the text carries storage types only — the authored
 * databases/{db}.db.ts stays the source of truth.
 */
export async function getDatabaseSchemaOnSandbox(
  auth: Authenticator,
  { space, database }: { space: SpaceResource; database: string }
): Promise<Result<string, SandboxFunctionError>> {
  const outDir = path.posix.join(DB_SCHEMA_STAGING_ROOT, randomUUID());
  const outPath = path.posix.join(outDir, `${database}.db.ts`);
  const result = await execDbCommand(auth, space, {
    command: [
      "set -euo pipefail",
      `rm -rf -- ${shellEscape(outDir)}`,
      `mkdir -p -- ${shellEscape(outDir)}`,
      // `--` stops the model-influenced database name from being read as a flag.
      `${DSBX_BIN_PATH} db schema -- ${shellEscape(database)} ${shellEscape(outPath)}`,
      // Pin the artifact hash in the same exec; verified after the provider
      // read-back below (the read-back runs as root and follows symlinks, so a
      // swapped staging file would otherwise read an arbitrary root file).
      ...stagingHashCaptureLines([outPath]),
    ].join("\n"),
    schema: schemaEnvelopeSchema,
    what: `dsbx db schema ${database}`,
    stagingCapture: true,
  });
  if (result.isErr()) {
    return result;
  }
  const {
    sandbox,
    envelope,
    stagingHashes,
    execStderr: execStderrForIntegrity,
  } = result.value;
  if (!("ok" in envelope) || !envelope.ok) {
    return new Err(
      dbErrorToSandboxFunctionError(database, envelope, "internal")
    );
  }

  const fileResult = await sandbox.readFile(auth, outPath);
  if (fileResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", fileResult.error.message)
    );
  }
  const integrity = verifyStagingContent(
    outPath,
    fileResult.value,
    stagingHashes,
    { execStderr: execStderrForIntegrity }
  );
  if (integrity.isErr()) {
    return integrity;
  }
  return new Ok(fileResult.value.toString("utf8"));
}

// Success mirrors QueryOutcome in cli/dust-sandbox/functions-runner/db/query.ts.
const queryEnvelopeSchema = z.union([
  z.object({
    ok: z.literal(true),
    columns: z.array(z.string()),
    rows: z.array(z.record(z.unknown())),
    row_count: z.number(),
    changes: z.number().nullable(),
    results_file: z.string().nullable(),
    note: z.string().nullable(),
  }),
  dbErrorEnvelopeSchema,
]);

export interface QueryDatabaseResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  // Rows affected for statements that return no columns (plain INSERT/UPDATE/DELETE); null for
  // result-returning statements.
  changes: number | null;
  // Set when the result crossed the runner's inline bounds: `rows` is then a preview and the full
  // result set is at this sandbox path, one JSON object per line.
  resultsFile: string | null;
  note: string | null;
}

/**
 * `dsbx db query`: execute one SQL statement (stdin) against a live database. The runner allows
 * SELECT and DML but refuses DDL/PRAGMA/ATTACH, so the schema only evolves through reconcile.
 */
export async function queryDatabaseOnSandbox(
  auth: Authenticator,
  {
    space,
    database,
    sql,
  }: { space: SpaceResource; database: string; sql: string }
): Promise<Result<QueryDatabaseResult, SandboxFunctionError>> {
  const result = await execDbCommand(auth, space, {
    // `--` stops the model-influenced database name from being read as a flag.
    command: `set -euo pipefail\n${DSBX_BIN_PATH} db query -- ${shellEscape(database)}`,
    schema: queryEnvelopeSchema,
    what: `dsbx db query ${database}`,
    // Oversized results spill into this pod-files dir (writable by agent-proxied), so the full
    // set becomes a pod file. Mirrors the pod mount in dust_file_system.ts. The var name must
    // match POD_QUERY_SPILL_DIR_ENV in cli/dust-sandbox/src/commands/db/query.rs.
    envVars: {
      DUST_POD_QUERY_SPILL_DIR: `/files/${SCOPED_PREFIX_POD}${space.sId}/${TOOL_OUTPUTS_FOLDER_NAME}/db`,
    },
    stdin: sql,
  });
  if (result.isErr()) {
    return result;
  }
  const { envelope } = result.value;
  if ("ok" in envelope && envelope.ok) {
    return new Ok({
      columns: envelope.columns,
      rows: envelope.rows,
      rowCount: envelope.row_count,
      changes: envelope.changes,
      resultsFile: envelope.results_file,
      note: envelope.note,
    });
  }
  return new Err(dbErrorToSandboxFunctionError(database, envelope, "internal"));
}
