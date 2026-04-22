import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlerExtra,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SANDBOX_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox/metadata";
import config from "@app/lib/api/config";
import {
  generateExecId,
  generateSandboxExecToken,
  revokeExecToken,
} from "@app/lib/api/sandbox/access_tokens";
import {
  checkEgressForwarderHealth,
  readNewDenyLogEntries,
  setupEgressForwarder,
} from "@app/lib/api/sandbox/egress";
import {
  mountConversationFiles,
  refreshGcsToken,
} from "@app/lib/api/sandbox/gcs/mount";
import {
  createToolManifest,
  getSandboxImage,
  getToolsForProvider,
  toolManifestToJSON,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image";
import { wrapCommand } from "@app/lib/api/sandbox/image/profile";
import { recordToolDuration } from "@app/lib/api/sandbox/instrumentation";
import type { ExecResult } from "@app/lib/api/sandbox/provider";
import { startTelemetry } from "@app/lib/api/sandbox/telemetry";
import type { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { Err, Ok, type Result } from "@app/types/shared/result";

const DEFAULT_WORKING_DIRECTORY = "/home/agent";
const DEFAULT_EXEC_TIMEOUT_MS = 60_000;

interface FormatExecOutputOpts {
  denyLogEntries?: string[];
}

function formatExecOutput(
  result: ExecResult,
  opts?: FormatExecOutputOpts
): string {
  const sections: string[] = [];

  if (result.stdout) {
    sections.push(`<stdout>\n${result.stdout}\n</stdout>`);
  }

  if (result.stderr) {
    sections.push(`<stderr>\n${result.stderr}\n</stderr>`);
  }

  if (result.exitCode !== 0) {
    sections.push(`<exit_code>${result.exitCode}</exit_code>`);
  }

  if (opts?.denyLogEntries && opts.denyLogEntries.length > 0) {
    sections.push(
      `<network_proxy_logs>\n${opts.denyLogEntries.join("\n")}\n</network_proxy_logs>`
    );
  }

  return sections.join("\n") || "(no output)";
}

export function createSandboxTools(
  _auth: Authenticator,
  _agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof SANDBOX_TOOLS_METADATA> = {
    bash: runSandboxBashTool,
    describe_toolset: async ({ format }, { auth, agentLoopContext }) => {
      const providerId =
        agentLoopContext?.runContext?.agentConfiguration.model.providerId;
      if (!providerId) {
        return new Err(new MCPError("Missing model provider ID"));
      }
      const toolsResult = getToolsForProvider(auth, providerId);
      if (toolsResult.isErr()) {
        return new Err(new MCPError(toolsResult.error.message));
      }
      const manifest = createToolManifest(toolsResult.value);
      const output =
        format === "json"
          ? toolManifestToJSON(manifest)
          : toolManifestToYAML(manifest);

      return new Ok([{ type: "text" as const, text: output }]);
    },
  };

  return buildTools(SANDBOX_TOOLS_METADATA, handlers);
}

export async function runSandboxBashTool(
  {
    command,
    workingDirectory,
    timeoutMs,
  }: {
    command: string;
    description: string;
    timeoutMs?: number;
    workingDirectory?: string;
  },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<Result<Array<{ type: "text"; text: string }>, MCPError>> {
  const conversation = agentLoopContext?.runContext?.conversation;
  const agentConfiguration = agentLoopContext?.runContext?.agentConfiguration;
  const agentMessage = agentLoopContext?.runContext?.agentMessage;
  if (!conversation || !agentConfiguration || !agentMessage) {
    return new Err(new MCPError("No conversation context available."));
  }

  const ensureResult = await SandboxResource.ensureActive(auth, conversation);
  if (ensureResult.isErr()) {
    return new Err(new MCPError(ensureResult.error.message));
  }

  const { sandbox, freshlyCreated, wokeFromSleep } = ensureResult.value;

  const imageResult = getSandboxImage(auth);
  if (imageResult.isOk()) {
    const image = imageResult.value;

    void startTelemetry(auth, sandbox, conversation).catch((err) =>
      logger.error({ err }, "Telemetry start failed (fire-and-forget)")
    );

    if (freshlyCreated || wokeFromSleep) {
      void mountConversationFiles(auth, sandbox, conversation, image).catch(
        (err) => logger.error({ err }, "GCS mount failed (fire-and-forget)")
      );
    } else {
      void refreshGcsToken(auth, sandbox, conversation, image).catch((err) =>
        logger.error({ err }, "GCS token refresh failed (fire-and-forget)")
      );
    }
  } else {
    logger.error(
      { err: imageResult.error },
      "Failed to get sandbox image for GCS mount"
    );
  }

  if (freshlyCreated) {
    const setupResult = await setupEgressForwarder(auth, sandbox);
    if (setupResult.isErr()) {
      return new Err(new MCPError(setupResult.error.message));
    }
  }

  const healthResult = await checkEgressForwarderHealth(auth, sandbox);
  if (healthResult.isErr()) {
    return new Err(new MCPError(healthResult.error.message));
  }

  if (!healthResult.value) {
    logger.warn(
      {
        event: "egress.health_fail",
        providerId: sandbox.providerId,
        sandboxId: sandbox.sId,
      },
      "Sandbox egress forwarder health check failed, restarting"
    );
    const setupResult = await setupEgressForwarder(auth, sandbox);
    if (setupResult.isErr()) {
      return new Err(new MCPError(setupResult.error.message));
    }
  } else {
    logger.info(
      {
        event: "egress.health_ok",
        providerId: sandbox.providerId,
        sandboxId: sandbox.sId,
      },
      "Sandbox egress forwarder health check succeeded"
    );
  }

  const execId = generateExecId();
  const sandboxToken = await generateSandboxExecToken(auth, {
    agentConfiguration,
    agentMessage,
    conversation,
    sandbox,
    execId,
    expiryMs: DEFAULT_EXEC_TIMEOUT_MS,
  });

  const metricsCtx = { workspaceId: auth.getNonNullableWorkspace().sId };
  const startMs = performance.now();

  const providerId = agentConfiguration.model.providerId;
  const timeoutSec = timeoutMs ? Math.ceil(timeoutMs / 1000) : 60;
  const wrappedCommand = wrapCommand(command, providerId, {
    timeoutSec,
  });

  const sandboxAPIBase =
    isDevelopment() && config.getSandboxDevFrontHostName()
      ? `https://${config.getSandboxDevFrontHostName()}`
      : config.getClientFacingUrl();

  const execResult = await sandbox.exec(auth, wrappedCommand, {
    workingDirectory: workingDirectory ?? DEFAULT_WORKING_DIRECTORY,
    envVars: {
      DUST_SANDBOX_TOKEN: sandboxToken,
      DUST_API_URL: `${sandboxAPIBase}/api/v1/w/${auth.getNonNullableWorkspace().sId}`,
    },
    user: "agent-proxied",
  });

  const durationMs = performance.now() - startMs;
  recordToolDuration(
    "bash",
    durationMs,
    metricsCtx,
    execResult.isOk() ? "success" : "error"
  );

  void revokeExecToken({ sbId: sandbox.sId, execId }).catch((err) =>
    logger.error({ error: err }, "Failed to revoke exec token")
  );

  if (execResult.isErr()) {
    return new Err(new MCPError(execResult.error.message));
  }

  let denyLogEntries: string[] | undefined;
  const denyResult = await readNewDenyLogEntries(auth, sandbox);
  if (denyResult.isErr()) {
    logger.warn(
      { err: denyResult.error, providerId: sandbox.providerId },
      "Failed to read egress deny log"
    );
  } else if (denyResult.value.length > 0) {
    denyLogEntries = denyResult.value;
  }

  const output = formatExecOutput(execResult.value, { denyLogEntries });

  return new Ok([{ type: "text" as const, text: output }]);
}
