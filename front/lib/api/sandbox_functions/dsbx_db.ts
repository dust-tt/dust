import { randomUUID } from "node:crypto";
import path from "node:path";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system/types";
import {
  podDatabaseExecEnvVars,
  TOOL_OUTPUTS_FOLDER_NAME,
} from "@app/lib/api/files/mount_path";
import { getRedisStreamClient } from "@app/lib/api/redis";
import { syncPodDatabaseAfterCreate } from "@app/lib/api/sandbox/db";
import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import {
  podDatabasePrefixFromPodPath,
  resolvePodDatabaseName,
} from "@app/lib/api/sandbox_functions/db_naming";
import type { SandboxFunctionErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { StagingHashes } from "@app/lib/api/sandbox_functions/staging_integrity";
import {
  splitStagingStdout,
  stagingHashCaptureLines,
  verifyStagingContent,
} from "@app/lib/api/sandbox_functions/staging_integrity";
import type { Authenticator } from "@app/lib/auth";
import { distributedLock, distributedUnlock } from "@app/lib/lock";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

import type { DbErrorKind } from "../../../../cli/dust-sandbox/functions-runner/types/db";

const DSBX_BIN_PATH = "/opt/bin/dsbx";
const DB_EXEC_TIMEOUT_MS = 60 * 1000;

// The two error envelopes a dsbx db command can print: the runner's typed `{ok:false}`
// (DbCommandError in cli/dust-sandbox/functions-runner/db/common.ts) and dsbx's own bare
// `{error}` (emit_error in cli/dust-sandbox/src/commands/function/mod.rs).
const dbErrorEnvelopeSchema = z.union([
  z.object({
    ok: z.literal(false),
    error: z.object({ kind: z.string(), message: z.string() }),
  }),
  z.object({ error: z.string() }),
]);

// Runner error kinds the model can fix itself (bad schema, destructive/disallowed DDL, bad SQL,
// unknown database). Typed by the runner's kind union so a renamed kind fails this typecheck.
const MODEL_CORRECTABLE_DB_KINDS: ReadonlySet<string> = new Set<DbErrorKind>([
  "schema_unresolvable",
  "schema_invalid",
  "destructive_change",
  "disallowed_statement",
  "database_not_found",
  "query_failed",
  "empty_sql",
]);

// `dsbxErrorCode` is the code for dsbx's bare `{error}` envelope: reconcile_blocked where the
// model supplies the inputs dsbx validates (reconcile takes a model-supplied schema path);
// internal for list/schema/query, which pre-validate the db name at the tool boundary so only
// infra failures reach here.
function dbErrorToSandboxFunctionError(
  database: string | null,
  envelope: z.infer<typeof dbErrorEnvelopeSchema>,
  dsbxErrorCode: SandboxFunctionErrorCode
): SandboxFunctionError {
  const prefix = database === null ? "" : `Database "${database}": `;
  if ("ok" in envelope) {
    const { kind, message } = envelope.error;
    // A destructive refusal often just means the schema file lags the live database (a prior
    // publish applied wider DDL), so it looks like it drops columns it never declared.
    const driftHint =
      kind === "destructive_change"
        ? " If you did not remove anything, the schema file may be behind the live database: " +
          "declare the missing tables and columns and republish."
        : "";
    return new SandboxFunctionError(
      MODEL_CORRECTABLE_DB_KINDS.has(kind)
        ? "reconcile_blocked"
        : "reconcile_failed",
      `${prefix}${message}${driftHint}`
    );
  }
  return new SandboxFunctionError(dsbxErrorCode, `${prefix}${envelope.error}`);
}

// Ensure the pod sandbox is up, run a `dsbx db` command as agent-proxied, and parse its one-line
// JSON envelope. Returns the sandbox too, since `db schema` reads a file back afterwards.
async function execDbCommand<S extends z.ZodTypeAny>(
  auth: Authenticator,
  space: SpaceResource,
  {
    command,
    schema,
    what,
    envVars,
    stdin,
    stagingCapture = false,
  }: {
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
  const ensureResult = await ensurePodSandboxReady(auth, space);
  if (ensureResult.isErr()) {
    return new Err(
      new SandboxFunctionError(
        "sandbox_unavailable",
        ensureResult.error.message
      )
    );
  }
  const { sandbox } = ensureResult.value;

  const execResult = await sandbox.exec(auth, command, {
    timeoutMs: DB_EXEC_TIMEOUT_MS,
    envVars: { ...podDatabaseExecEnvVars(), ...envVars },
    user: "agent-proxied",
    stdin,
  });
  if (execResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", execResult.error.message)
    );
  }

  // Split only when this exec appended capture lines. Splitting unconditionally would let code
  // the command imports (e.g. the model-written schema file during reconcile) print a forged
  // marker line and shadow the real envelope, which is otherwise always the last stdout line.
  const { dsbxStdout, hashes } = stagingCapture
    ? splitStagingStdout(execResult.value.stdout)
    : { dsbxStdout: execResult.value.stdout, hashes: {} };
  const envelope = parseDbEnvelope(dsbxStdout, schema, what);
  if (envelope.isErr()) {
    return envelope;
  }
  return new Ok({
    sandbox,
    envelope: envelope.value,
    stagingHashes: hashes,
    execStderr: execResult.value.stderr,
  });
}

// Success mirrors the reconcile result in cli/dust-sandbox/functions-runner/db/reconcile.ts.
const reconcileEnvelopeSchema = z.union([
  z.object({
    ok: z.literal(true),
    created: z.boolean(),
    statements: z.array(z.string()),
  }),
  dbErrorEnvelopeSchema,
]);

export interface ReconcileDatabaseResult {
  /**
   * The on-disk database name that was reconciled: the app-relative name qualified with the app
   * prefix (see resolvePodDatabaseName). Reported back because it is what `db_list`, `db_query` and
   * `db_schema` address the database by, and it is not what the caller passed in.
   */
  database: string;
  created: boolean;
  statements: string[];
  /**
   * Set when the database was created but its first replication sync could not be confirmed: the
   * DDL did apply, but until replication catches up an unclean sandbox end could lose the file.
   */
  replicationWarning?: string;
}

/**
 * `dsbx db reconcile <name> <schema-file>`: plan the DDL for the database's drizzle schema file,
 * apply it when strictly additive, refuse anything destructive. Runs as `agent-proxied` (the
 * schema file is model-written code that gets imported).
 *
 * Lock-free inner reconcile: `database` must be the resolved on-disk name and callers must
 * serialize concurrent reconciles of one pod themselves (see `reconcileDatabaseFromPodPath`,
 * which holds the per-pod lock and resolves the name inside it).
 */
export async function reconcileDatabaseOnSandbox(
  auth: Authenticator,
  {
    space,
    database,
    schemaFileSandboxPath,
  }: {
    space: SpaceResource;
    database: string;
    schemaFileSandboxPath: string;
  }
): Promise<Result<ReconcileDatabaseResult, SandboxFunctionError>> {
  const result = await execDbCommand(auth, space, {
    // `--` stops the model-influenced name and path from being read as flags.
    command: `set -euo pipefail\n${DSBX_BIN_PATH} db reconcile -- ${shellEscape(database)} ${shellEscape(schemaFileSandboxPath)}`,
    schema: reconcileEnvelopeSchema,
    what: `dsbx db reconcile ${database}`,
  });
  if (result.isErr()) {
    return result;
  }
  const { sandbox, envelope } = result.value;

  if ("ok" in envelope && envelope.ok) {
    if (envelope.statements.length > 0) {
      logger.info(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          podId: space.sId,
          database,
          created: envelope.created,
          statements: envelope.statements,
        },
        "Pod database reconciled: applied DDL"
      );
    }

    // A freshly created database exists only on the sandbox disk until litestream's first sync:
    // wait for that sync before reporting success, so "created" means durable. On failure the
    // reconcile still succeeds (the DDL applied and reconcile is idempotent) but carries a
    // warning; the pre-sleep sync remains the enforcement point that blocks the pause and pages.
    let replicationWarning: string | undefined;
    if (envelope.created) {
      const syncResult = await syncPodDatabaseAfterCreate(
        auth,
        sandbox,
        database
      );
      if (syncResult.isErr()) {
        logger.error(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            podId: space.sId,
            database,
            err: syncResult.error,
          },
          "Pod database created but its first replication sync could not be confirmed"
        );
        replicationWarning =
          `The database was created and its schema applied, but its first replication sync ` +
          `could not be confirmed. If the sandbox ends uncleanly before replication catches ` +
          `up, the database may disappear and need another reconcile.`;
      }
    }

    return new Ok({
      database,
      created: envelope.created,
      statements: envelope.statements,
      ...(replicationWarning !== undefined ? { replicationWarning } : {}),
    });
  }

  // A bare `{error}` here is a bad database name or missing schema file, both model-supplied.
  return new Err(
    dbErrorToSandboxFunctionError(database, envelope, "reconcile_blocked")
  );
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
    const existingResult = await listDatabasesOnSandbox(auth, { space });
    if (existingResult.isErr()) {
      return new Err(existingResult.error);
    }

    return await reconcileDatabaseOnSandbox(auth, {
      space,
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

// Success mirrors the `dsbx db list` envelope in cli/dust-sandbox/src/commands/db/list.rs.
const listEnvelopeSchema = z.union([
  z.object({
    ok: z.literal(true),
    databases: z.array(z.object({ name: z.string(), size_bytes: z.number() })),
  }),
  dbErrorEnvelopeSchema,
]);

export interface LiveDatabaseEntry {
  name: string;
  sizeBytes: number;
}

/** `dsbx db list`: enumerate the live `{db}.db` files with their sizes (WAL included). */
export async function listDatabasesOnSandbox(
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<Result<LiveDatabaseEntry[], SandboxFunctionError>> {
  const result = await execDbCommand(auth, space, {
    command: `${DSBX_BIN_PATH} db list`,
    schema: listEnvelopeSchema,
    what: "dsbx db list",
  });
  if (result.isErr()) {
    return result;
  }
  const { envelope } = result.value;
  if ("ok" in envelope && envelope.ok) {
    return new Ok(
      envelope.databases.map((db) => ({
        name: db.name,
        sizeBytes: db.size_bytes,
      }))
    );
  }
  return new Err(dbErrorToSandboxFunctionError(null, envelope, "internal"));
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

/**
 * Parse the one-line JSON envelope a dsbx command prints as its last non-empty stdout line
 * (sandbox stdout can carry shell noise and be truncated; big payloads go to files).
 */
function parseDbEnvelope<S extends z.ZodTypeAny>(
  stdout: string,
  schema: S,
  what: string
): Result<z.infer<S>, SandboxFunctionError> {
  const lastLine =
    stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .at(-1) ?? "";
  if (lastLine.length === 0) {
    return new Err(
      new SandboxFunctionError("internal", `${what} produced no output.`)
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(lastLine);
  } catch (err) {
    return new Err(
      new SandboxFunctionError(
        "internal",
        `Unparseable ${what} output: ${normalizeError(err).message}`
      )
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return new Err(
      new SandboxFunctionError("internal", `Unexpected ${what} output shape.`)
    );
  }

  return new Ok(parsed.data);
}
