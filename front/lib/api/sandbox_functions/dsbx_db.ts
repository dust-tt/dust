import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
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
  database: string,
  envelope: z.infer<typeof dbErrorEnvelopeSchema>
): SandboxFunctionError {
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
      `Database "${database}": ${message}${driftHint}`
    );
  }
  // dsbx-level `{error}`: bad database name or missing schema file — model-correctable.
  return new SandboxFunctionError(
    "reconcile_blocked",
    `Database "${database}": ${envelope.error}`
  );
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

  return new Err(dbErrorToSandboxFunctionError(database, parsed));
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
