import { randomBytes } from "node:crypto";
import config from "@app/lib/api/config";
import { traceSandboxStartupPhase } from "@app/lib/api/sandbox/instrumentation";
import type { SandboxRuntimeOwner } from "@app/lib/api/sandbox/owner";
import {
  getSandboxOwnerEnvVars,
  getSandboxOwnerLogContext,
} from "@app/lib/api/sandbox/owner";
import { rootCommand } from "@app/lib/api/sandbox/root_command";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const FLUENT_BIT_ENV_PATH = "/run/dust/fluent-bit.env";
const DD_HOST = "http-intake.logs.datadoghq.eu";
const TELEMETRY_ENV_VALUE_PATTERN = /^[A-Za-z0-9_./:@-]+$/;

function validateTelemetryEnvVars(
  envVars: Record<string, string>
): Result<void, Error> {
  for (const [name, value] of Object.entries(envVars)) {
    if (!value || !TELEMETRY_ENV_VALUE_PATTERN.test(value)) {
      return new Err(
        new Error(`Invalid sandbox telemetry environment value for ${name}.`)
      );
    }
  }

  return new Ok(undefined);
}

/**
 * Start fluent-bit telemetry in a sandbox.
 *
 * Writes a root-only EnvironmentFile and starts the fluent-bit service.
 * Designed to be called fire-and-forget after sandbox creation or wake.
 *
 * The dedicated sandbox key is transported in the root process environment,
 * never argv or the systemd manager environment. The service reads it from a
 * root-owned mode-0600 file that unprivileged sandbox accounts cannot access.
 */
export async function startTelemetry(
  auth: Authenticator,
  sandbox: SandboxResource,
  owner: SandboxRuntimeOwner
): Promise<Result<void, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const ownerEnvVars = getSandboxOwnerEnvVars(owner);

  const childLogger = logger.child({
    sandboxId: sandbox.sId,
    workspaceId,
    ...getSandboxOwnerLogContext(owner),
  });

  const datadogApiKey = config.getSandboxDatadogApiKey();
  if (!datadogApiKey) {
    const error = new Error("SANDBOX_DD_API_KEY is not configured.");
    childLogger.error(
      { err: error, panic: true },
      "Refusing to start sandbox telemetry without a dedicated Datadog API key"
    );
    return new Err(error);
  }

  const envVars = {
    DD_HOST,
    DD_API_KEY: datadogApiKey,
    E2B_SANDBOX_ID: sandbox.providerId,
    ...ownerEnvVars,
    WORKSPACE_ID: workspaceId,
  };
  const validation = validateTelemetryEnvVars(envVars);
  if (validation.isErr()) {
    childLogger.error(
      { err: validation.error, panic: true },
      "Refusing to start sandbox telemetry with invalid environment values"
    );
    return validation;
  }

  const tmpPath = `${FLUENT_BIT_ENV_PATH}.${randomBytes(8).toString("hex")}.tmp`;
  const environmentLines = Object.keys(envVars)
    .map((name) => `"${name}=$${name}"`)
    .join(" ");

  // /!\ DD_API_KEY must never appear literally in the command string;
  // journalctl logs argv. Bash expands it only inside the root process.
  const result = await traceSandboxStartupPhase("telemetry_start", () =>
    sandbox.execRoot(
      auth,
      rootCommand.unsafeShell(
        `/usr/bin/install -d -o root -g root -m 755 /run/dust && umask 077 && builtin printf '%s\\n' ${environmentLines} > ${tmpPath} && /bin/chown root:root ${tmpPath} && /bin/chmod 600 ${tmpPath} && /bin/mv -f ${tmpPath} ${FLUENT_BIT_ENV_PATH} && /usr/bin/systemctl restart fluent-bit`,
        "bash builtins atomically render validated environment values into a root-only Fluent Bit EnvironmentFile without embedding the key in argv"
      ),
      {
        envVars,
      }
    )
  );

  if (result.isErr()) {
    childLogger.error({ err: result.error }, "Failed to start telemetry");
    return result;
  }

  if (result.value.exitCode !== 0) {
    const error = new Error(
      `Failed to start sandbox telemetry: ${
        result.value.stderr || result.value.stdout || "unknown error"
      }`
    );
    childLogger.error({ err: error }, "Failed to start telemetry");
    return new Err(error);
  }

  childLogger.info({}, "Telemetry started successfully");
  return new Ok(undefined);
}
