import { randomUUID } from "node:crypto";
import path from "node:path";
import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import type { SandboxFunctionErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { FunctionManifests } from "@app/lib/api/sandbox_functions/manifests";
import { functionManifestsSchema } from "@app/lib/api/sandbox_functions/manifests";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";

const DSBX_BIN_PATH = "/opt/bin/dsbx";
// Non-mounted scratch root, so a build never writes into the pod files mount.
const BUILD_STAGING_ROOT = "/tmp/dust-sandbox-function-builds";
const BUILD_EXEC_TIMEOUT_MS = 2 * 60 * 1000;

export interface SandboxFunctionBuildResult {
  bundleCode: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  // Per-database manifests (manifest.v1); null when the function declares no databases.
  manifests: FunctionManifests | null;
}

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
  databases: functionManifestsSchema.optional(),
});

function mapBuildErrorKind(kind: string): SandboxFunctionErrorCode {
  switch (kind) {
    case "build_failed":
      return "build_failed";
    case "schema_extraction_failed":
      return "schema_extraction_failed";
    // Manifest rejections (manifest.v1 typed build errors, see
    // cli/dust-sandbox/functions-runner/manifest.ts): the model fixes them by editing its
    // `schema.databases` declaration or the database schema file.
    case "databases_declaration_invalid":
    case "database_schema_unresolvable":
    case "database_schema_invalid":
      return "invalid_contract";
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
  // dsbx prints one JSON envelope. Take the last non-empty line to ignore any shell noise.
  const lastLine =
    stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .at(-1) ?? "";
  if (lastLine.length === 0) {
    return new Err(
      new SandboxFunctionError(
        "internal",
        "dsbx function build produced no output."
      )
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(lastLine);
  } catch (err) {
    return new Err(
      new SandboxFunctionError(
        "internal",
        `Unparseable dsbx output: ${normalizeError(err).message}`
      )
    );
  }

  const parsed = buildEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    return new Err(
      new SandboxFunctionError("internal", "Unexpected dsbx output shape.")
    );
  }

  return new Ok(parsed.data);
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
    manifests: parsed.data.databases ?? null,
  });
}
