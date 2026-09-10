import { randomUUID } from "node:crypto";
import path from "node:path";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import type { SandboxFunctionErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { StagingHashes } from "@app/lib/api/sandbox_functions/staging_integrity";
import {
  splitStagingStdout,
  stagingHashCaptureLines,
  verifyStagingContent,
} from "@app/lib/api/sandbox_functions/staging_integrity";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { SANDBOX_DATABASE_NAME_REGEX } from "@app/types/api/sandbox_functions";
import {
  SANDBOX_STATE_DATABASES_DIR,
  sandboxDatabaseExecEnvVars,
} from "@app/types/mount_path";
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

type DbCommandArgs<S extends z.ZodTypeAny> = {
  command: string;
  schema: S;
  what: string;
  envVars?: Record<string, string>;
  stdin?: string;
  // Set only when `command` appends stagingHashCaptureLines.
  stagingCapture?: boolean;
};

type DbCommandResult<S extends z.ZodTypeAny> = Result<
  {
    sandbox: SandboxResource;
    envelope: z.infer<S>;
    stagingHashes: StagingHashes;
    execStderr: string;
  },
  SandboxFunctionError
>;

// Run a `dsbx db` command as agent-proxied on an already-ready owner sandbox and parse its
// one-line JSON envelope. Returns the sandbox too, since `db schema` reads a file back afterwards.
async function execDbCommandOnReadySandbox<S extends z.ZodTypeAny>(
  auth: Authenticator,
  sandbox: SandboxResource,
  {
    command,
    schema,
    what,
    envVars,
    stdin,
    stagingCapture = false,
  }: DbCommandArgs<S>
): Promise<DbCommandResult<S>> {
  const execResult = await sandbox.exec(auth, command, {
    timeoutMs: DB_EXEC_TIMEOUT_MS,
    envVars: { ...sandboxDatabaseExecEnvVars(), ...envVars },
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
   * The on-disk database name that was reconciled. Pod callers qualify the app-relative name with
   * their app prefix; Frame callers use the unprefixed Frame-owned name.
   */
  database: string;
  created: boolean;
  statements: string[];
}

/**
 * `dsbx db reconcile <name> <schema-file>`: plan the DDL for the database's drizzle schema file,
 * apply it when strictly additive, refuse anything destructive. Runs as `agent-proxied` (the
 * schema file is model-written code that gets imported).
 */
export async function reconcileDatabaseOnReadySandbox(
  auth: Authenticator,
  {
    sandbox,
    database,
    schemaFileSandboxPath,
  }: {
    sandbox: SandboxResource;
    database: string;
    schemaFileSandboxPath: string;
  }
): Promise<Result<ReconcileDatabaseResult, SandboxFunctionError>> {
  const result = await execDbCommandOnReadySandbox(auth, sandbox, {
    // `--` stops the model-influenced name and path from being read as flags.
    command: `set -euo pipefail\n${DSBX_BIN_PATH} db reconcile -- ${shellEscape(database)} ${shellEscape(schemaFileSandboxPath)}`,
    schema: reconcileEnvelopeSchema,
    what: `dsbx db reconcile ${database}`,
  });
  if (result.isErr()) {
    return result;
  }
  const { envelope } = result.value;

  if ("ok" in envelope && envelope.ok) {
    return new Ok({
      database,
      created: envelope.created,
      statements: envelope.statements,
    });
  }

  // A bare `{error}` here is a bad database name or missing schema file, both model-supplied.
  return new Err(
    dbErrorToSandboxFunctionError(database, envelope, "reconcile_blocked")
  );
}

/** Absolute path so the command never resolves `rm` through a workload-influenced PATH. */
const RM_BIN_PATH = "/bin/rm";

/**
 * SQLite sidecars that belong to a database file and must go with it. The runner uses
 * `wal_autocheckpoint=0`, so recent rows can live entirely in `-wal`: leaving it behind would let a
 * later reconcile of the same name recover data this delete was meant to destroy.
 */
const DATABASE_SIDECAR_SUFFIXES = ["-wal", "-shm"];

// `rm` prints nothing on success, so the command appends the envelope itself. Under `set -euo
// pipefail` a failed `rm` never reaches the echo, leaving no envelope for parseDbEnvelope to find —
// which is what turns the failure into an error rather than a silent success.
const deleteEnvelopeSchema = z.union([
  z.object({ ok: z.literal(true) }),
  dbErrorEnvelopeSchema,
]);

/**
 * Remove a live database and its SQLite sidecars from the sandbox's databases directory.
 *
 * Deliberately NOT a dsbx subcommand: dsbx is the agent-facing CLI, and a destructive database
 * primitive there would be discoverable from inside the sandbox. Front builds the command instead,
 * so this adds no surface a workload can reach. It grants no new capability either — the databases
 * dir is group-writable by `agent` (mode 2770), so workload code can already unlink its own
 * database files.
 *
 * Idempotent: `rm -f` succeeds when the files are already gone, so a caller working from a replica
 * listing never has to check what is live first.
 *
 * Only the LIVE files go. The litestream replica is the durable copy, so a caller deleting a
 * database for good must also restart the daemon (`restartLitestreamDaemon`, which is what makes it
 * let go of the removed files) and wipe the replica prefix (`deleteFrameDatabaseReplica`), or the
 * next cold-start restore brings the database back.
 */
export async function deleteDatabaseOnReadySandbox(
  auth: Authenticator,
  { sandbox, database }: { sandbox: SandboxResource; database: string }
): Promise<Result<undefined, SandboxFunctionError>> {
  // The name contract (`^[a-z][a-z0-9_]{0,63}$`) admits no separator or dot, so a validated name
  // cannot escape the databases directory. The same guard runs on the replica path.
  if (!SANDBOX_DATABASE_NAME_REGEX.test(database)) {
    return new Err(
      new SandboxFunctionError(
        "internal",
        `Invalid sandbox database name: '${database}'.`
      )
    );
  }

  const dbPath = `${SANDBOX_STATE_DATABASES_DIR}/${database}.db`;
  // `rm` unlinks a symlink itself rather than following it, so a link planted in the
  // workload-writable databases dir cannot make this reach a foreign file.
  const paths = [
    dbPath,
    ...DATABASE_SIDECAR_SUFFIXES.map((suffix) => `${dbPath}${suffix}`),
  ].map((each) => shellEscape(each));

  const result = await execDbCommandOnReadySandbox(auth, sandbox, {
    // `--` stops the paths from being read as flags.
    command: [
      "set -euo pipefail",
      `${RM_BIN_PATH} -f -- ${paths.join(" ")}`,
      `echo '{"ok":true}'`,
    ].join("\n"),
    schema: deleteEnvelopeSchema,
    what: `remove sandbox database ${database}`,
  });
  if (result.isErr()) {
    return result;
  }
  const { envelope } = result.value;

  if ("ok" in envelope && envelope.ok) {
    logger.info(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        sandboxId: sandbox.sId,
        database,
      },
      "Sandbox database deleted: removed live files"
    );
    return new Ok(undefined);
  }

  return new Err(dbErrorToSandboxFunctionError(database, envelope, "internal"));
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

/** `dsbx db list` against an already-ready sandbox, whatever owns it (Pod or Frame). */
export async function listDatabasesOnReadySandbox(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<LiveDatabaseEntry[], SandboxFunctionError>> {
  const result = await execDbCommandOnReadySandbox(auth, sandbox, {
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

// Non-mounted scratch roots for regenerated schema files and oversized query results
// (cf. BUILD_STAGING_ROOT).
const DB_SCHEMA_STAGING_ROOT = "/tmp/dust-sandbox-db-schemas";
const DB_QUERY_SPILL_ROOT = "/tmp/dust-sandbox-db-query-results";

/**
 * `dsbx db schema`: regenerate a drizzle schema file from the live database and read its text
 * back. SQLite does not store column modes, so the text carries storage types only — the authored
 * databases/{db}.db.ts stays the source of truth.
 */
export async function getDatabaseSchemaOnReadySandbox(
  auth: Authenticator,
  { sandbox, database }: { sandbox: SandboxResource; database: string }
): Promise<Result<string, SandboxFunctionError>> {
  const outDir = path.posix.join(DB_SCHEMA_STAGING_ROOT, randomUUID());
  const outPath = path.posix.join(outDir, `${database}.db.ts`);
  const result = await execDbCommandOnReadySandbox(auth, sandbox, {
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
  // result set is at this sandbox path, one JSON object per line. Read it back off the same
  // sandbox; it is scratch space, so it does not outlive the sandbox.
  resultsFile: string | null;
  note: string | null;
}

/**
 * `dsbx db query`: execute one SQL statement (stdin) against a live database. The runner allows
 * SELECT and DML but refuses DDL/PRAGMA/ATTACH, so the schema only evolves through reconcile.
 */
export async function queryDatabaseOnReadySandbox(
  auth: Authenticator,
  {
    sandbox,
    database,
    sql,
  }: { sandbox: SandboxResource; database: string; sql: string }
): Promise<Result<QueryDatabaseResult, SandboxFunctionError>> {
  const result = await execDbCommandOnReadySandbox(auth, sandbox, {
    // `--` stops the model-influenced database name from being read as a flag.
    command: `set -euo pipefail\n${DSBX_BIN_PATH} db query -- ${shellEscape(database)}`,
    schema: queryEnvelopeSchema,
    what: `dsbx db query ${database}`,
    // Oversized results spill here rather than into a files mount: a Frame-owned sandbox carries
    // no agent-visible one. The spill is a plain sandbox path, so `resultsFile` is read back off
    // the same sandbox the caller passed in. The var name must match POD_QUERY_SPILL_DIR_ENV in
    // cli/dust-sandbox/src/commands/db/query.rs.
    envVars: { DUST_POD_QUERY_SPILL_DIR: DB_QUERY_SPILL_ROOT },
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
