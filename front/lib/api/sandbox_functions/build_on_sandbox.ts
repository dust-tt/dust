import { randomUUID } from "node:crypto";
import path from "node:path";
import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import type { SandboxFunctionErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import {
  splitStagingStdout,
  stagingHashCaptureLines,
  verifyStagingContent,
} from "@app/lib/api/sandbox_functions/staging_integrity";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { SandboxFunctionUserIdentityPolicy } from "@app/types/api/sandbox_functions";
import { SANDBOX_FUNCTION_USER_IDENTITY_POLICIES } from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";

const DSBX_BIN_PATH = "/opt/bin/dsbx";
// Non-mounted scratch root, so a build never writes into the pod files mount.
const BUILD_STAGING_ROOT = "/tmp/dust-sandbox-function-builds";
const BUILD_EXEC_TIMEOUT_MS = 2 * 60 * 1000;

interface SandboxFunctionBuildResult {
  bundleCode: string;
  userIdentity: SandboxFunctionUserIdentityPolicy;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
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

// Mirrors FunctionSchema in cli/dust-sandbox/functions-runner/schema.ts.
const functionSchemaFileSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  userIdentity: z.enum(SANDBOX_FUNCTION_USER_IDENTITY_POLICIES),
  input_schema: jsonSchemaValue.nullable(),
  output_schema: jsonSchemaValue.nullable(),
});

function mapBuildErrorKind(kind: string): SandboxFunctionErrorCode {
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
    // Pin the artifact hashes in the same exec; verified after the provider read-back
    // below (the read-back runs as root and follows symlinks, so a swapped staging
    // file would otherwise read an arbitrary root file).
    ...stagingHashCaptureLines([bundlePath, schemaPath]),
  ].join("\n");

  const execResult = await sandbox.exec(auth, command, {
    timeoutMs: BUILD_EXEC_TIMEOUT_MS,
    user: "agent-proxied",
  });
  logger.error(
    `============ Sandbox function build failed on pod ${space.sId} for source ${srcSandboxPath}: ${command}`
  );
  if (execResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", execResult.error.message)
    );
  }

  const { dsbxStdout, hashes } = splitStagingStdout(execResult.value.stdout);
  const envelope = parseBuildEnvelope(dsbxStdout);
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
  const bundleIntegrity = verifyStagingContent(
    bundlePath,
    bundleResult.value,
    hashes,
    { execStderr: execResult.value.stderr }
  );
  if (bundleIntegrity.isErr()) {
    return bundleIntegrity;
  }
  const schemaResult = await sandbox.readFile(auth, schemaPath);
  if (schemaResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", schemaResult.error.message)
    );
  }
  const schemaIntegrity = verifyStagingContent(
    schemaPath,
    schemaResult.value,
    hashes,
    { execStderr: execResult.value.stderr }
  );
  if (schemaIntegrity.isErr()) {
    return schemaIntegrity;
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

  const {
    userIdentity,
    input_schema: inputSchema,
    output_schema: outputSchema,
  } = parsed.data;
  if (inputSchema === null || outputSchema === null) {
    return new Err(
      new SandboxFunctionError(
        "invalid_contract",
        "The function must export both an `input` and an `output` schema."
      )
    );
  }

  return new Ok({ bundleCode, userIdentity, inputSchema, outputSchema });
}
