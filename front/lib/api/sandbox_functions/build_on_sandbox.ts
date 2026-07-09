import { randomUUID } from "node:crypto";
import path from "node:path";
import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import { parseDbEnvelope } from "@app/lib/api/sandbox_functions/dsbx_db";
import type { SandboxFunctionErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { POD_DATABASE_NAME_REGEX } from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";

import type { DatabaseSchemaErrorKind } from "../../../../cli/dust-sandbox/functions-runner/types/db";

const DSBX_BIN_PATH = "/opt/bin/dsbx";
// Non-mounted scratch root, so a build never writes into the pod files mount.
const BUILD_STAGING_ROOT = "/tmp/dust-sandbox-function-builds";
const BUILD_EXEC_TIMEOUT_MS = 2 * 60 * 1000;

export interface SandboxFunctionBuildResult {
  bundleCode: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  // Databases the function declares (name -> schema file path relative to the source), from
  // the build envelope; null when the function declares none.
  databases: Record<string, { schemaFile: string }> | null;
}

// The build envelope's `databases` block (wire version 1). The runner also ships each table's
// full shape, but front only needs which databases the function declares and where each schema
// file lives (the reconcile inputs) — table shapes live in the pod's schema files and the live
// SQLite file, nowhere else. The envelope is read back from the sandbox, where model-authored
// code runs, so front revalidates the database names instead of trusting the runner.
// Database names become plain-object keys in front, and the name regex alone lets
// `constructor`/`prototype` through (only `__proto__` fails its leading-letter rule) —
// reject the reserved keys explicitly, mirroring the runner's declaration check.
const RESERVED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const declaredDatabasesSchema = z.object({
  version: z.literal(1),
  databases: z.record(
    z
      .string()
      .regex(POD_DATABASE_NAME_REGEX)
      .refine((name) => !RESERVED_OBJECT_KEYS.has(name), {
        message: "reserved name",
      }),
    z.object({ schemaFile: z.string() })
  ),
});

// dsbx writes the bundle and schema to files (sandbox stdout can be truncated) and prints only
// this envelope. Mirrors BuildResult in cli/dust-sandbox/functions-runner/build.ts.
const buildEnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    error: z.object({ kind: z.string(), message: z.string() }),
  }),
]);

// z.custom brands the parsed value as JSONSchema, avoiding an unsafe cast.
const jsonSchemaValue = z.custom<JSONSchema>(
  (v) => typeof v === "object" && v !== null
);

// Mirrors FunctionSchema in cli/dust-sandbox/functions-runner/schema.ts. `databases` stays
// optional so schema files produced by older dsbx images keep parsing.
const functionSchemaFileSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  input_schema: jsonSchemaValue.nullable(),
  output_schema: jsonSchemaValue.nullable(),
  databases: declaredDatabasesSchema.optional(),
});

// Database schema rejections (typed build errors) map to the model-correctable
// invalid_contract: the model fixes them by editing its `schema.databases` declaration or
// the database schema file. Keyed by the runner's DatabaseSchemaErrorKind so a renamed or added
// kind fails the typecheck here instead of silently degrading to internal.
const DATABASE_SCHEMA_ERROR_CODES: Record<
  DatabaseSchemaErrorKind,
  SandboxFunctionErrorCode
> = {
  databases_declaration_invalid: "invalid_contract",
  database_schema_unresolvable: "invalid_contract",
  database_schema_invalid: "invalid_contract",
};

function isDatabaseSchemaErrorKind(
  kind: string
): kind is DatabaseSchemaErrorKind {
  // hasOwnProperty, not `in`: the envelope kind is sandbox-influenced, and `in` would match
  // Object.prototype keys like "constructor".
  return Object.prototype.hasOwnProperty.call(
    DATABASE_SCHEMA_ERROR_CODES,
    kind
  );
}

function mapBuildErrorKind(kind: string): SandboxFunctionErrorCode {
  if (isDatabaseSchemaErrorKind(kind)) {
    return DATABASE_SCHEMA_ERROR_CODES[kind];
  }
  switch (kind) {
    case "build_failed":
      return "build_failed";
    case "schema_extraction_failed":
      return "schema_extraction_failed";
    default:
      // bad_args means our own argv is wrong, not the function.
      return "internal";
  }
}

/**
 * Build a sandbox function on the pod sandbox: ensure the pod's sandbox is up, bundle the source at
 * `srcSandboxPath` (absolute, under the pod mount) via `dsbx function build`, then read back the
 * bundle and its extracted I/O contract from a non-mounted scratch dir.
 *
 * Runs as `agent-proxied` (the egress-controlled invocation user) because extracting the schema
 * imports the module and runs its untrusted top-level code.
 */
export async function buildSandboxFunctionOnSandbox(
  auth: Authenticator,
  {
    space,
    srcSandboxPath,
  }: {
    space: SpaceResource;
    srcSandboxPath: string;
  }
): Promise<Result<SandboxFunctionBuildResult, SandboxFunctionError>> {
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

  const buildDir = path.posix.join(BUILD_STAGING_ROOT, randomUUID());
  const bundlePath = path.posix.join(buildDir, "bundle.js");
  const schemaPath = path.posix.join(buildDir, "schema.json");

  const command = [
    "set -euo pipefail",
    `rm -rf -- ${shellEscape(buildDir)}`,
    `mkdir -p -- ${shellEscape(buildDir)}`,
    // `--` stops the model-supplied source path from being read as a dsbx flag.
    `${DSBX_BIN_PATH} function build -- ${shellEscape(srcSandboxPath)} ${shellEscape(bundlePath)} ${shellEscape(schemaPath)}`,
  ].join("\n");

  const execResult = await sandbox.exec(auth, command, {
    timeoutMs: BUILD_EXEC_TIMEOUT_MS,
    user: "agent-proxied",
  });
  if (execResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", execResult.error.message)
    );
  }

  const envelope = parseBuildEnvelope(execResult.value.stdout);
  if (envelope.isErr()) {
    return envelope;
  }
  if (!envelope.value.ok) {
    const { kind, message } = envelope.value.error;
    return new Err(new SandboxFunctionError(mapBuildErrorKind(kind), message));
  }

  // Success means dsbx wrote both files.
  const bundleResult = await sandbox.readFile(auth, bundlePath);
  if (bundleResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", bundleResult.error.message)
    );
  }
  const schemaResult = await sandbox.readFile(auth, schemaPath);
  if (schemaResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", schemaResult.error.message)
    );
  }

  return parseSchemaFile(
    schemaResult.value.toString("utf8"),
    bundleResult.value.toString("utf8")
  );
}

function parseBuildEnvelope(
  stdout: string
): Result<z.infer<typeof buildEnvelopeSchema>, SandboxFunctionError> {
  return parseDbEnvelope(stdout, buildEnvelopeSchema, "dsbx function build");
}

function parseSchemaFile(
  rawSchema: string,
  bundleCode: string
): Result<SandboxFunctionBuildResult, SandboxFunctionError> {
  let json: unknown;
  try {
    json = JSON.parse(rawSchema);
  } catch (err) {
    return new Err(
      new SandboxFunctionError(
        "schema_extraction_failed",
        `Unparseable schema file: ${normalizeError(err).message}`
      )
    );
  }

  const parsed = functionSchemaFileSchema.safeParse(json);
  if (!parsed.success) {
    return new Err(
      new SandboxFunctionError(
        "schema_extraction_failed",
        "Unexpected schema file shape."
      )
    );
  }

  const { input_schema: inputSchema, output_schema: outputSchema } =
    parsed.data;
  if (inputSchema === null || outputSchema === null) {
    return new Err(
      new SandboxFunctionError(
        "invalid_contract",
        "The function must export both an `input` and an `output` schema."
      )
    );
  }

  return new Ok({
    bundleCode,
    inputSchema,
    outputSchema,
    databases: parsed.data.databases?.databases ?? null,
  });
}
