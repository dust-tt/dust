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
  sandboxSupportsEgressForwarding,
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
const MAX_OUTPUT_LINES = 2_000;
const MAX_OUTPUT_BYTES = 50_000;

// TODO(SANDBOX-S1): Offload large outputs to a temporary file on the sandbox
// (like coding agents do). The model would only see tail-truncated output plus
// the path to the full output file, which it can read back if needed.
function formatExecOutput(result: ExecResult): string {
  const parts: string[] = [];

  if (result.stdout) {
    parts.push(result.stdout);
  }
  if (result.stderr) {
    parts.push(`[stderr]\n${result.stderr}`);
  }
  if (result.exitCode !== 0) {
    parts.push(`[exit code: ${result.exitCode}]`);
  }

  let output = parts.join("\n");

  const lines = output.split("\n");
  const byteLength = Buffer.byteLength(output, "utf-8");

  if (lines.length > MAX_OUTPUT_LINES || byteLength > MAX_OUTPUT_BYTES) {
    if (lines.length > MAX_OUTPUT_LINES) {
      output = lines.slice(0, MAX_OUTPUT_LINES).join("\n");
    }

    if (Buffer.byteLength(output, "utf-8") > MAX_OUTPUT_BYTES) {
      // Truncate to MAX_OUTPUT_BYTES at a line boundary.
      const truncatedLines: string[] = [];
      let currentBytes = 0;
      for (const line of output.split("\n")) {
        const lineBytes = Buffer.byteLength(line + "\n", "utf-8");
        if (currentBytes + lineBytes > MAX_OUTPUT_BYTES) {
          break;
        }
        truncatedLines.push(line);
        currentBytes += lineBytes;
      }
      output = truncatedLines.join("\n");
    }

    output += "\n[Output truncated — exceeded limit]";
  }

  return output || "(no output)";
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

  const egressCompatResult = await sandboxSupportsEgressForwarding(
    auth,
    sandbox
  );
  if (egressCompatResult.isErr()) {
    return new Err(new MCPError(egressCompatResult.error.message));
  }

  let execUser: string | undefined;
  if (!egressCompatResult.value) {
    logger.info(
      {
        event: "egress.compat_skip",
        providerId: sandbox.providerId,
        sandboxId: sandbox.sId,
      },
      "Skipping sandbox egress setup for an incompatible sandbox"
    );
  } else {
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

    execUser = "agent-proxied";
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
    ...(execUser ? { user: execUser } : {}),
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

  let output = formatExecOutput(execResult.value);

  if (execUser) {
    const denyResult = await readNewDenyLogEntries(auth, sandbox);
    if (denyResult.isErr()) {
      logger.warn(
        { err: denyResult.error, providerId: sandbox.providerId },
        "Failed to read egress deny log"
      );
    } else if (denyResult.value.length > 0) {
      output +=
        "\n[network proxy] Recent outbound request(s) denied by the sandbox proxy:\n" +
        denyResult.value.map((line) => `  ${line}`).join("\n");
    }
  }

  return new Ok([{ type: "text" as const, text: output }]);
}
