import { randomUUID } from "node:crypto";
import path from "node:path";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import type { SandboxFunctionErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock, LockAcquisitionTimeoutError } from "@app/lib/lock";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

import type { DbErrorKind } from "../../../../cli/dust-sandbox/functions-runner/types/db";

const DSBX_BIN_PATH = "/opt/bin/dsbx";
const DB_EXEC_TIMEOUT_MS = 60 * 1000;

// Mirrors DEFAULT_POD_DATABASES_DIR in cli/dust-sandbox/src/commands/db/mod.rs.
// Passed explicitly on every `dsbx db` exec, like DUST_FUNCTIONS_DIR on `function run`.
export const DUST_POD_DATABASES_DIR = "/pod-state/databases";

// Mirrors the runner envelopes in cli/dust-sandbox/functions-runner/db_reconcile.ts /
// db_common.ts, plus dsbx's own `{error}` shape (emit_error in
// cli/dust-sandbox/src/commands/function/mod.rs).
const dbErrorEnvelopeSchema = z.union([
  z.object({
    ok: z.literal(false),
    error: z.object({ kind: z.string(), message: z.string() }),
  }),
  z.object({ error: z.string() }),
]);

const reconcileEnvelopeSchema = z.union([
  z.object({
    ok: z.literal(true),
    created: z.boolean(),
    statements: z.array(z.string()),
  }),
  dbErrorEnvelopeSchema,
]);

export interface ReconcileDatabaseResult {
  created: boolean;
  statements: string[];
}

// Runner error kinds the model can fix itself (bad schema file, destructive DDL, bad SQL,
// unknown database) — mapped to `reconcile_blocked` (surfaced verbatim, tracked:false at the
// MCP boundary). Everything else maps to `reconcile_failed`. The list is typed by the
// runner's own kind union so a renamed kind fails the typecheck here instead of silently
// degrading; the set reads plain wire strings.
const MODEL_CORRECTABLE_DB_KIND_LIST: DbErrorKind[] = [
  "schema_unresolvable",
  "schema_invalid",
  "destructive_change",
  "disallowed_statement",
  "database_not_found",
  "query_failed",
  "empty_sql",
];
const MODEL_CORRECTABLE_DB_KINDS: ReadonlySet<string> = new Set(
  MODEL_CORRECTABLE_DB_KIND_LIST
);

function dbErrorToSandboxFunctionError(
  database: string | null,
  envelope: z.infer<typeof dbErrorEnvelopeSchema>,
  // Code for the dsbx-level `{error}` envelope (as opposed to the runner's typed
  // `{ok: false}`). It is model-correctable only where the model controls the inputs dsbx
  // validates: reconcile takes a model-supplied schema path, while list/schema/query
  // pre-validate the database name at the tool boundary, leaving only infrastructure
  // failures (runner spawn, unreadable databases dir).
  dsbxErrorCode: SandboxFunctionErrorCode
): SandboxFunctionError {
  const prefix = database === null ? "" : `Database "${database}": `;
  if ("ok" in envelope) {
    const { kind, message } = envelope.error;
    // A destructive refusal can also mean the schema file is behind the live database
    // (another function's publish or a previously failed one already applied wider DDL): the
    // file then looks like it drops columns it simply never declared. Spell out the recovery.
    const driftHint =
      kind === "destructive_change"
        ? " If you did not remove anything, this schema file may be behind the live " +
          "database: declare the missing tables and columns and republish."
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

/**
 * Run `dsbx db reconcile <name> <schema-file>` on the pod sandbox: plan the DDL for the
 * database's drizzle schema file, apply it when strictly additive, refuse anything destructive
 * with a typed error. Runs as `agent-proxied` (the schema file is model-written code that gets
 * imported).
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

  const command = [
    "set -euo pipefail",
    // `--` stops the model-influenced database name and schema path from being read as flags.
    `${DSBX_BIN_PATH} db reconcile -- ${shellEscape(database)} ${shellEscape(schemaFileSandboxPath)}`,
  ].join("\n");

  const execResult = await sandbox.exec(auth, command, {
    timeoutMs: DB_EXEC_TIMEOUT_MS,
    envVars: { DUST_POD_DATABASES_DIR },
    user: "agent-proxied",
  });
  if (execResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", execResult.error.message)
    );
  }

  const envelope = parseDbEnvelope(
    execResult.value.stdout,
    reconcileEnvelopeSchema,
    `dsbx db reconcile ${database}`
  );
  if (envelope.isErr()) {
    return envelope;
  }
  const parsed = envelope.value;

  if ("ok" in parsed && parsed.ok === true) {
    // The applied DDL mutated a live pod database: leave a trace.
    if (parsed.statements.length > 0) {
      logger.info(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          podId: space.sId,
          database,
          created: parsed.created,
          statements: parsed.statements,
        },
        "Pod database reconciled: applied DDL"
      );
    }
    return new Ok({ created: parsed.created, statements: parsed.statements });
  }

  // dsbx-level `{error}` here means a bad database name or missing schema file, both
  // model-supplied on this path.
  return new Err(
    dbErrorToSandboxFunctionError(database, parsed, "reconcile_blocked")
  );
}

const RECONCILE_LOCK_ACQUIRE_TIMEOUT_MS = 30_000;

/**
 * Resolve a model-supplied scoped schema-file path (e.g. `pod-{id}/databases/chat.db.ts`) to
 * its in-sandbox path and reconcile the database against it. This is the ONLY path that
 * applies schema changes to a live database (publish validates but never applies); concurrent
 * reconciles of one pod are serialized under a per-pod lock.
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
  try {
    return await executeWithLock(
      `sandbox_function:db_reconcile:${space.sId}`,
      async () =>
        reconcileDatabaseOnSandbox(auth, {
          space,
          database,
          schemaFileSandboxPath: resolved.value,
        }),
      RECONCILE_LOCK_ACQUIRE_TIMEOUT_MS,
      { traceAcquireResource: "sandbox_function.db_reconcile" }
    );
  } catch (err) {
    if (err instanceof LockAcquisitionTimeoutError) {
      return new Err(
        new SandboxFunctionError(
          "publish_conflict",
          `Another reconcile is in progress for this pod; retry shortly. (${err.message})`
        )
      );
    }
    throw err;
  }
}

// Mirrors the `dsbx db list` envelope in cli/dust-sandbox/src/commands/db/list.rs.
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

/**
 * Run `dsbx db list` on the pod sandbox: enumerate the live `{db}.db` files with their sizes
 * (WAL included).
 */
export async function listDatabasesOnSandbox(
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<Result<LiveDatabaseEntry[], SandboxFunctionError>> {
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

  const execResult = await sandbox.exec(auth, `${DSBX_BIN_PATH} db list`, {
    timeoutMs: DB_EXEC_TIMEOUT_MS,
    envVars: { DUST_POD_DATABASES_DIR },
    user: "agent-proxied",
  });
  if (execResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", execResult.error.message)
    );
  }

  const envelope = parseDbEnvelope(
    execResult.value.stdout,
    listEnvelopeSchema,
    "dsbx db list"
  );
  if (envelope.isErr()) {
    return envelope;
  }
  const parsed = envelope.value;
  if ("ok" in parsed && parsed.ok === true) {
    return new Ok(
      parsed.databases.map((db) => ({
        name: db.name,
        sizeBytes: db.size_bytes,
      }))
    );
  }
  return new Err(dbErrorToSandboxFunctionError(null, parsed, "internal"));
}

// `dsbx db schema` follows the file-output pattern (the regenerated file is the payload,
// stdout only carries the envelope), so success is a bare `{ok}`.
const schemaEnvelopeSchema = z.union([
  z.object({ ok: z.literal(true) }),
  dbErrorEnvelopeSchema,
]);

// Non-mounted scratch root for regenerated schema files, like BUILD_STAGING_ROOT in
// build_on_sandbox.ts.
const DB_SCHEMA_STAGING_ROOT = "/tmp/dust-sandbox-db-schemas";

/**
 * Run `dsbx db schema` on the pod sandbox: regenerate a drizzle schema file from the live
 * database and read its text back. Column modes are not stored in SQLite, so the text carries
 * storage types only — the authored databases/{db}.db.ts stays the source of truth.
 */
export async function getDatabaseSchemaOnSandbox(
  auth: Authenticator,
  { space, database }: { space: SpaceResource; database: string }
): Promise<Result<string, SandboxFunctionError>> {
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

  const outDir = path.posix.join(DB_SCHEMA_STAGING_ROOT, randomUUID());
  const outPath = path.posix.join(outDir, `${database}.db.ts`);
  const command = [
    "set -euo pipefail",
    `rm -rf -- ${shellEscape(outDir)}`,
    `mkdir -p -- ${shellEscape(outDir)}`,
    // `--` stops the model-influenced database name from being read as a flag.
    `${DSBX_BIN_PATH} db schema -- ${shellEscape(database)} ${shellEscape(outPath)}`,
  ].join("\n");

  const execResult = await sandbox.exec(auth, command, {
    timeoutMs: DB_EXEC_TIMEOUT_MS,
    envVars: { DUST_POD_DATABASES_DIR },
    user: "agent-proxied",
  });
  if (execResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", execResult.error.message)
    );
  }

  const envelope = parseDbEnvelope(
    execResult.value.stdout,
    schemaEnvelopeSchema,
    `dsbx db schema ${database}`
  );
  if (envelope.isErr()) {
    return envelope;
  }
  const parsed = envelope.value;
  if (!("ok" in parsed) || parsed.ok !== true) {
    return new Err(dbErrorToSandboxFunctionError(database, parsed, "internal"));
  }

  const fileResult = await sandbox.readFile(auth, outPath);
  if (fileResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", fileResult.error.message)
    );
  }
  return new Ok(fileResult.value.toString("utf8"));
}

// Mirrors QuerySuccess in cli/dust-sandbox/functions-runner/db_query.ts.
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
  // Rows affected, for statements that return no columns (plain INSERT/UPDATE/DELETE);
  // null for result-returning statements.
  changes: number | null;
  // Set when the result crossed the runner's inline bounds: `rows` is then a preview and the
  // complete result set is at this sandbox path, one JSON object per line.
  resultsFile: string | null;
  note: string | null;
}

/**
 * Run `dsbx db query` on the pod sandbox: execute one SQL statement (stdin) against a live
 * database. The runner allows SELECT and DML but refuses DDL/PRAGMA/ATTACH, so the schema
 * only evolves through reconcile.
 */
export async function queryDatabaseOnSandbox(
  auth: Authenticator,
  {
    space,
    database,
    sql,
  }: { space: SpaceResource; database: string; sql: string }
): Promise<Result<QueryDatabaseResult, SandboxFunctionError>> {
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

  const command = [
    "set -euo pipefail",
    // `--` stops the model-influenced database name from being read as a flag.
    `${DSBX_BIN_PATH} db query -- ${shellEscape(database)}`,
  ].join("\n");

  const execResult = await sandbox.exec(auth, command, {
    timeoutMs: DB_EXEC_TIMEOUT_MS,
    envVars: { DUST_POD_DATABASES_DIR },
    user: "agent-proxied",
    stdin: sql,
  });
  if (execResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", execResult.error.message)
    );
  }

  const envelope = parseDbEnvelope(
    execResult.value.stdout,
    queryEnvelopeSchema,
    `dsbx db query ${database}`
  );
  if (envelope.isErr()) {
    return envelope;
  }
  const parsed = envelope.value;
  if ("ok" in parsed && parsed.ok === true) {
    return new Ok({
      columns: parsed.columns,
      rows: parsed.rows,
      rowCount: parsed.row_count,
      changes: parsed.changes,
      resultsFile: parsed.results_file,
      note: parsed.note,
    });
  }
  return new Err(dbErrorToSandboxFunctionError(database, parsed, "internal"));
}

/**
 * Parse the one-line JSON envelope a dsbx command prints as its last non-empty stdout line
 * (sandbox stdout can carry shell noise and be truncated; files carry big payloads). Shared
 * with `dsbx function build` (build_on_sandbox.ts).
 */
export function parseDbEnvelope<S extends z.ZodTypeAny>(
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
