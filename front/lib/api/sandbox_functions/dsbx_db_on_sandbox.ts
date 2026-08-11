import { podDatabaseExecEnvVars } from "@app/lib/api/files/mount_path";
import { syncPodDatabaseAfterCreate } from "@app/lib/api/sandbox/db";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import type { SandboxFunctionErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { StagingHashes } from "@app/lib/api/sandbox_functions/staging_integrity";
import { splitStagingStdout } from "@app/lib/api/sandbox_functions/staging_integrity";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

import type { DbErrorKind } from "../../../../cli/dust-sandbox/functions-runner/types/db";

/**
 * Sandbox-level `dsbx db` plumbing: run a db command against an ALREADY-READY sandbox and parse
 * its envelope. The pod-level wrappers in `dsbx_db.ts` add `ensurePodSandboxReady` on top; this
 * module must stay free of any lifecycle import so the cold-start path (which runs INSIDE
 * sandbox bring-up, where re-entering `ensurePodSandboxReady` would be incorrect) can use it
 * without an import cycle.
 */

export const DSBX_BIN_PATH = "/opt/bin/dsbx";
const DB_EXEC_TIMEOUT_MS = 60 * 1000;

// The two error envelopes a dsbx db command can print: the runner's typed `{ok:false}`
// (DbCommandError in cli/dust-sandbox/functions-runner/db/common.ts) and dsbx's own bare
// `{error}` (emit_error in cli/dust-sandbox/src/commands/function/mod.rs).
export const dbErrorEnvelopeSchema = z.union([
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
export function dbErrorToSandboxFunctionError(
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

/**
 * Run a `dsbx db` command as agent-proxied on the given sandbox and parse its one-line JSON
 * envelope. The sandbox must already be ready (mounts up, litestream daemon started for
 * reconciles) — see `execDbCommand` in `dsbx_db.ts` for the readiness-ensuring wrapper.
 */
export async function execDbCommandOnSandbox<S extends z.ZodTypeAny>(
  auth: Authenticator,
  sandbox: SandboxResource,
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
      envelope: z.infer<S>;
      stagingHashes: StagingHashes;
      execStderr: string;
    },
    SandboxFunctionError
  >
> {
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
 * which holds the per-pod lock and resolves the name inside it). The litestream daemon must be
 * running, so the post-create sync can confirm the new file reached the replica.
 */
export async function reconcileDatabaseOnSandbox(
  auth: Authenticator,
  {
    sandbox,
    podId,
    database,
    schemaFileSandboxPath,
  }: {
    sandbox: SandboxResource;
    podId: string;
    database: string;
    schemaFileSandboxPath: string;
  }
): Promise<Result<ReconcileDatabaseResult, SandboxFunctionError>> {
  const result = await execDbCommandOnSandbox(auth, sandbox, {
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
    if (envelope.statements.length > 0) {
      logger.info(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          podId,
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
            podId,
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

/** `dsbx db list` on an already-ready sandbox: the live `{db}.db` files with their sizes. */
export async function listPodDatabases(
  auth: Authenticator,
  { sandbox }: { sandbox: SandboxResource }
): Promise<Result<LiveDatabaseEntry[], SandboxFunctionError>> {
  const result = await execDbCommandOnSandbox(auth, sandbox, {
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
