import config from "@app/lib/api/config";
import { traceSandboxStartupPhase } from "@app/lib/api/sandbox/instrumentation";
import {
  getSandboxOwnerEnvVars,
  getSandboxOwnerLogContext,
  type SandboxRuntimeOwner,
} from "@app/lib/api/sandbox/owner";
import { rootCommand } from "@app/lib/api/sandbox/root_command";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Start fluent-bit telemetry in a sandbox.
 *
 * Sets up systemd environment variables and starts the fluent-bit service.
 * Designed to be called fire-and-forget after sandbox creation or wake.
 *
 * Environment variables are passed via envVars to avoid exposing sensitive
 * values (like DD_API_KEY) in journalctl command logs.
 */
export async function startTelemetry(
  auth: Authenticator,
  sandbox: SandboxResource,
  owner: SandboxRuntimeOwner
): Promise<Result<void, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const ownerEnvVars = getSandboxOwnerEnvVars(owner);
  const ownerSystemdEnv = Object.keys(ownerEnvVars)
    .map((name) => `${name}="$${name}"`)
    .join(" ");

  const childLogger = logger.child({
    sandboxId: sandbox.sId,
    workspaceId,
    ...getSandboxOwnerLogContext(owner),
  });

  // /!\ DD_API_KEY must never appear literally in the command string;
  // journalctl logs argv. Always interpolate from the envVars below.
  const result = await traceSandboxStartupPhase("telemetry_start", () =>
    sandbox.execRoot(
      auth,
      rootCommand.unsafeShell(
        `/usr/bin/systemctl set-environment DD_HOST="$DD_HOST" DD_API_KEY="$DD_API_KEY" E2B_SANDBOX_ID="$E2B_SANDBOX_ID" ${ownerSystemdEnv} WORKSPACE_ID="$WORKSPACE_ID" && /usr/bin/systemctl start fluent-bit`,
        "systemctl environment command expands sandbox env vars without embedding secrets in the TypeScript command string"
      ),
      {
        envVars: {
          DD_HOST: "http-intake.logs.datadoghq.eu",
          DD_API_KEY: config.getDatadogApiKey() ?? "",
          E2B_SANDBOX_ID: sandbox.providerId,
          ...ownerEnvVars,
          WORKSPACE_ID: workspaceId,
        },
      }
    )
  );

  if (result.isErr()) {
    childLogger.error({ err: result.error }, "Failed to start telemetry");
    return result;
  }

  childLogger.info({}, "Telemetry started successfully");
  return new Ok(undefined);
}
