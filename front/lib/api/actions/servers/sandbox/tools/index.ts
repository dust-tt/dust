import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SANDBOX_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox/metadata";
import config from "@app/lib/api/config";
import {
  generateSandboxExecToken,
  registerExecToken,
  revokeExecToken,
} from "@app/lib/api/sandbox/access_tokens";
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
import {
  buildWaitAndCollectCommand,
  generateExecId,
  wrapCommandWithCapture,
} from "@app/lib/api/sandbox/image/profile";
import { recordToolDuration } from "@app/lib/api/sandbox/instrumentation";
import type { ExecResult } from "@app/lib/api/sandbox/provider";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { startTelemetry } from "@app/lib/api/sandbox/telemetry";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

const DEFAULT_WORKING_DIRECTORY = "/home/agent";
const GRACE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes before pausing sandbox
const BLOCKED_ACTION_POLL_INTERVAL_MS = 2_000;
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

/**
 * Monitors for blocked sandbox tool calls on the current message.
 * Subscribes to the Redis channel `sandbox:blocked:{messageSId}` and polls the
 * DB for blocked actions. When one is found, starts a grace period. If the
 * action is still blocked after the grace period, returns to signal a pause.
 *
 * Returns a promise that resolves only when a pause is needed.
 * Call `cleanup()` on the returned object when the monitor is no longer needed
 * (e.g., when exec wins the race) to release Redis subscriptions and timers.
 */
function monitorBlockedActions(
  auth: Authenticator,
  messageSId: string,
  agentMessageId: number
): { promise: Promise<{ actionId: string }>; cleanup: () => void } {
  let resolved = false;
  let pollInterval: ReturnType<typeof setInterval> | undefined;
  let unsubscribeFn: (() => void) | undefined;
  let graceTimeout: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    resolved = true;
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = undefined;
    }
    if (graceTimeout) {
      clearTimeout(graceTimeout);
      graceTimeout = undefined;
    }
    if (unsubscribeFn) {
      unsubscribeFn();
      unsubscribeFn = undefined;
    }
  };

  const promise = new Promise<{ actionId: string }>((resolve) => {
    const checkAndMaybeResolve = async (actionId: string) => {
      if (resolved) {
        return;
      }

      // Wait for the grace period.
      await new Promise<void>((r) => {
        graceTimeout = setTimeout(r, GRACE_PERIOD_MS);
      });

      if (resolved) {
        return;
      }

      // Check if the action is still blocked after grace period.
      const action = await AgentMCPActionResource.fetchById(auth, actionId);
      if (action && action.status === "blocked_validation_required") {
        resolved = true;
        resolve({ actionId });
      }
    };

    // Subscribe to Redis channel for real-time notification.
    const channelName = `sandbox:blocked:${messageSId}`;
    void getRedisHybridManager()
      .subscribe(
        channelName,
        (event) => {
          if (event === "close" || !event.message) {
            return;
          }
          try {
            const data = JSON.parse(event.message["payload"]);
            if (data.actionId) {
              void checkAndMaybeResolve(data.actionId);
            }
          } catch {
            // Ignore malformed events.
          }
        },
        "message_events"
      )
      .then((sub) => {
        unsubscribeFn = sub.unsubscribe;
        // If cleanup was called before subscribe completed, unsubscribe now.
        if (resolved) {
          sub.unsubscribe();
        }
      })
      .catch((err) => {
        logger.error(
          { error: normalizeError(err).message },
          "Failed to subscribe to sandbox blocked channel"
        );
      });

    // Also poll the DB as a fallback in case the Redis event is missed.
    pollInterval = setInterval(async () => {
      if (resolved) {
        return;
      }

      try {
        const actions =
          await AgentMCPActionResource.listBlockedActionsForAgentMessage(auth, {
            agentMessageId,
          });
        const blockedAction = actions.find(
          (a) =>
            a.status === "blocked_validation_required" &&
            a.stepContext.sandboxOrigin === true
        );
        if (blockedAction) {
          void checkAndMaybeResolve(blockedAction.sId);
        }
      } catch {
        // Ignore poll errors.
      }
    }, BLOCKED_ACTION_POLL_INTERVAL_MS);
  });

  return { promise, cleanup };
}

export function createSandboxTools(
  _auth: Authenticator,
  _agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof SANDBOX_TOOLS_METADATA> = {
    bash: async (
      { command, workingDirectory, timeoutMs },
      { auth, agentLoopContext }
    ) => {
      const runContext = agentLoopContext?.runContext;
      if (!runContext) {
        return new Err(new MCPError("No conversation context available."));
      }
      const { conversation, agentConfiguration, agentMessage, stepContext } =
        runContext;

      // Check if we're resuming from a paused sandbox.
      const resumeExecId = stepContext.resumeState?.execId;
      const isResumeMode =
        typeof resumeExecId === "string" && resumeExecId.length > 0;

      const ensureResult = await SandboxResource.ensureActive(
        auth,
        conversation
      );
      if (ensureResult.isErr()) {
        return new Err(new MCPError(ensureResult.error.message));
      }

      const { sandbox, freshlyCreated, wokeFromSleep } = ensureResult.value;

      // Mount GCS conversation files (fire-and-forget).
      // On fresh creation or wake-from-sleep, /tmp is empty so we need a full mount.
      // For already-running sandboxes we just refresh the token.
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
          void refreshGcsToken(auth, sandbox, conversation, image).catch(
            (err) =>
              logger.error(
                { err },
                "GCS token refresh failed (fire-and-forget)"
              )
          );
        }
      } else {
        logger.error(
          { err: imageResult.error },
          "Failed to get sandbox image for GCS mount"
        );
      }

      const metricsCtx = { workspaceSId: auth.getNonNullableWorkspace().sId };
      const startMs = performance.now();

      const providerId = agentConfiguration.model.providerId;
      const timeoutSec = timeoutMs ? Math.ceil(timeoutMs / 1000) : 60;

      // Build the command: resume mode uses "wait and collect", normal uses capture.
      let execId: string;
      let commandToRun: string;

      if (isResumeMode) {
        execId = resumeExecId;
        commandToRun = buildWaitAndCollectCommand(execId);
        logger.info(
          { execId, conversationId: conversation.sId },
          "Sandbox bash handler: resume mode — running wait-and-collect"
        );
      } else {
        execId = generateExecId();
        // Register the exec token in Redis for revocation support.
        await registerExecToken(sandbox.sId, execId);
        commandToRun = wrapCommandWithCapture(command, execId, providerId, {
          timeoutSec,
        });
      }

      const sandboxToken = generateSandboxExecToken(auth, {
        agentConfiguration,
        agentMessage,
        conversation,
        sandbox,
        execId,
      });

      const envVars = {
        DUST_SANDBOX_TOKEN: sandboxToken,
        DUST_API_URL: `${config.getClientFacingUrl()}/api/v1/w/${auth.getNonNullableWorkspace().sId}`,
      };

      // Race sandbox.exec() against a blocked action monitor.
      // The monitor subscribes to Redis for blocked sandbox tool calls and
      // triggers pause after the grace period expires.
      const monitor = monitorBlockedActions(
        auth,
        agentMessage.sId,
        agentMessage.agentMessageId
      );

      const execPromise = sandbox
        .exec(auth, commandToRun, {
          workingDirectory: workingDirectory ?? DEFAULT_WORKING_DIRECTORY,
          envVars,
        })
        .then((result) => ({ type: "exec_completed" as const, result }))
        .catch((err) => ({
          type: "exec_error" as const,
          error: normalizeError(err),
        }));

      const monitorPromise = monitor.promise.then((result) => ({
        type: "pause_requested" as const,
        ...result,
      }));

      // Race: exec completes OR a blocked action triggers a pause.
      const raceResult = await Promise.race([execPromise, monitorPromise]);

      if (raceResult.type === "exec_completed") {
        // Normal completion — no pause needed. Clean up monitor and token.
        monitor.cleanup();
        void revokeExecToken(sandbox.sId, execId);

        const durationMs = performance.now() - startMs;
        recordToolDuration(
          "bash",
          durationMs,
          metricsCtx,
          raceResult.result.isOk() ? "success" : "error"
        );

        if (raceResult.result.isErr()) {
          return new Err(new MCPError(raceResult.result.error.message));
        }

        const output = formatExecOutput(raceResult.result.value);
        return new Ok([{ type: "text" as const, text: output }]);
      }

      if (raceResult.type === "exec_error") {
        // Exec threw unexpectedly (not from a pause). Clean up and propagate.
        monitor.cleanup();
        void revokeExecToken(sandbox.sId, execId);
        return new Err(new MCPError(raceResult.error.message));
      }

      // raceResult.type === "pause_requested"
      // Grace period expired with a blocked action still pending.
      // Pause the sandbox and signal the agent loop to stop.
      monitor.cleanup();

      try {
        const pauseResult = await SandboxResource.pauseForApproval(
          auth,
          conversation.sId
        );
        if (pauseResult.isErr()) {
          logger.error(
            { error: pauseResult.error.message },
            "Failed to pause sandbox for approval"
          );
        }
      } catch (err) {
        logger.error(
          { error: normalizeError(err).message },
          "Error pausing sandbox for approval"
        );
      }

      // Wait for exec to throw (it will when the sandbox pauses).
      try {
        await execPromise;
      } catch {
        // Expected — SDK connection lost.
      }

      return new Ok([
        {
          type: "resource" as const,
          resource: {
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
            type: "tool_blocked_awaiting_input" as const,
            text: "Sandbox paused waiting for tool approval",
            uri: "",
            blockingEvents: [],
            state: { execId },
          },
        },
      ]);
    },
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
