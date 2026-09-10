import { shellEscape } from "@app/lib/api/sandbox/shell";
import type { SandboxFunctionErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { sandboxDatabaseExecEnvVars } from "@app/types/mount_path";
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
};

type DbCommandResult<S extends z.ZodTypeAny> = Result<
  z.infer<S>,
  SandboxFunctionError
>;

// Run a `dsbx db` command as agent-proxied on an already-ready owner sandbox and parse its
// one-line JSON envelope.
async function execDbCommandOnReadySandbox<S extends z.ZodTypeAny>(
  auth: Authenticator,
  sandbox: SandboxResource,
  { command, schema, what }: DbCommandArgs<S>
): Promise<DbCommandResult<S>> {
  const execResult = await sandbox.exec(auth, command, {
    timeoutMs: DB_EXEC_TIMEOUT_MS,
    envVars: sandboxDatabaseExecEnvVars(),
    user: "agent-proxied",
  });
  if (execResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", execResult.error.message)
    );
  }

  return parseDbEnvelope(execResult.value.stdout, schema, what);
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
  const envelope = result.value;

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
  const envelope = result.value;
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
