import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { ConversationType } from "@app/types/assistant/conversation";
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
  conversation: ConversationType
): Promise<Result<void, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const childLogger = logger.child({
    sandboxId: sandbox.sId,
    workspaceId,
    conversationId: conversation.sId,
  });

  const result = await sandbox.exec(
    auth,
    `systemctl set-environment DD_HOST="$DD_HOST" DD_API_KEY="$DD_API_KEY" E2B_SANDBOX_ID="$E2B_SANDBOX_ID" CONVERSATION_ID="$CONVERSATION_ID" WORKSPACE_ID="$WORKSPACE_ID" && systemctl start fluent-bit`,
    {
      user: "root",
      envVars: {
        DD_HOST: "http-intake.logs.datadoghq.eu",
        DD_API_KEY: config.getDatadogApiKey() ?? "",
        E2B_SANDBOX_ID: sandbox.providerId,
        CONVERSATION_ID: conversation.sId,
        WORKSPACE_ID: workspaceId,
      },
    }
  );

  if (result.isErr()) {
    childLogger.error({ err: result.error }, "Failed to start telemetry");
    return result;
  }

  childLogger.info({}, "Telemetry started successfully");
  return new Ok(undefined);
}
