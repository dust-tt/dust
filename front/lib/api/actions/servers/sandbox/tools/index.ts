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

function textSize(text: string): { lines: number; bytes: number } {
  return {
    lines: text.split("\n").length,
    bytes: Buffer.byteLength(text, "utf-8"),
  };
}

function fitsInBudget(
  text: string,
  maxLines: number,
  maxBytes: number
): boolean {
  const { lines, bytes } = textSize(text);
  return lines <= maxLines && bytes <= maxBytes;
}

// Truncate a text block at a line boundary so it stays within limits.
function truncateText(
  text: string,
  maxLines: number,
  maxBytes: number
): string {
  let result = text;

  const lines = result.split("\n");
  if (lines.length > maxLines) {
    result = lines.slice(0, maxLines).join("\n");
  }

  if (Buffer.byteLength(result, "utf-8") > maxBytes) {
    const kept: string[] = [];
    let currentBytes = 0;
    for (const line of result.split("\n")) {
      const lineBytes = Buffer.byteLength(line + "\n", "utf-8");
      if (currentBytes + lineBytes > maxBytes) {
        break;
      }
      kept.push(line);
      currentBytes += lineBytes;
    }
    result = kept.join("\n");
  }

  return result;
}

interface TruncatedOutput {
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

// Apply balanced truncation to stdout and stderr. When the combined output
// exceeds the budget, the smaller stream is kept in full and the larger one
// is truncated to fill the remainder. If both individually exceed half the
// budget, they are split evenly.
function truncateExecOutput(stdout: string, stderr: string): TruncatedOutput {
  if (fitsInBudget(stdout + stderr, MAX_OUTPUT_LINES, MAX_OUTPUT_BYTES)) {
    return { stdout, stderr, stdoutTruncated: false, stderrTruncated: false };
  }

  const stdoutSize = textSize(stdout);
  const stderrSize = textSize(stderr);
  const halfLines = Math.floor(MAX_OUTPUT_LINES / 2);
  const halfBytes = Math.floor(MAX_OUTPUT_BYTES / 2);

  const smaller = stdoutSize.bytes <= stderrSize.bytes ? "stdout" : "stderr";

  if (
    !fitsInBudget(smaller === "stdout" ? stdout : stderr, halfLines, halfBytes)
  ) {
    return {
      stdout: truncateText(stdout, halfLines, halfBytes),
      stderr: truncateText(stderr, halfLines, halfBytes),
      stdoutTruncated: true,
      stderrTruncated: true,
    };
  }

  if (smaller === "stderr") {
    const budgetLines = Math.max(MAX_OUTPUT_LINES - stderrSize.lines, 0);
    const budgetBytes = Math.max(MAX_OUTPUT_BYTES - stderrSize.bytes, 0);
    return {
      stdout: truncateText(stdout, budgetLines, budgetBytes),
      stderr,
      stdoutTruncated: true,
      stderrTruncated: false,
    };
  }

  const budgetLines = Math.max(MAX_OUTPUT_LINES - stdoutSize.lines, 0);
  const budgetBytes = Math.max(MAX_OUTPUT_BYTES - stdoutSize.bytes, 0);
  return {
    stdout,
    stderr: truncateText(stderr, budgetLines, budgetBytes),
    stdoutTruncated: false,
    stderrTruncated: true,
  };
}

interface FormatExecOutputOpts {
  denyLogEntries?: string[];
  stdoutFullPath?: string;
  stderrFullPath?: string;
}

function formatExecOutput(
  truncated: TruncatedOutput,
  exitCode: number,
  opts?: FormatExecOutputOpts
): string {
  const sections: string[] = [];

  if (truncated.stdout) {
    sections.push(`<stdout>\n${truncated.stdout}\n</stdout>`);
  }
  if (truncated.stdoutTruncated) {
    const path = opts?.stdoutFullPath;
    sections.push(
      path
        ? `<stdout_truncated>${path}</stdout_truncated>`
        : "<stdout_truncated />"
    );
  }

  if (truncated.stderr) {
    sections.push(`<stderr>\n${truncated.stderr}\n</stderr>`);
  }
  if (truncated.stderrTruncated) {
    const path = opts?.stderrFullPath;
    sections.push(
      path
        ? `<stderr_truncated>${path}</stderr_truncated>`
        : "<stderr_truncated />"
    );
  }

  if (exitCode !== 0) {
    sections.push(`<exit_code>${exitCode}</exit_code>`);
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

  const truncated = truncateExecOutput(
    execResult.value.stdout || "",
    execResult.value.stderr || ""
  );

  // When output was truncated, write the full content to temp files on the
  // sandbox so the model can read/grep them if needed.
  let stdoutFullPath: string | undefined;
  let stderrFullPath: string | undefined;
  if (truncated.stdoutTruncated && execResult.value.stdout) {
    stdoutFullPath = `/tmp/dust-exec-${execId}-stdout.log`;
    void sandbox
      .writeFile(
        auth,
        stdoutFullPath,
        new TextEncoder().encode(execResult.value.stdout).buffer
      )
      .catch((err) =>
        logger.error({ err }, "Failed to write full stdout to sandbox")
      );
  }
  if (truncated.stderrTruncated && execResult.value.stderr) {
    stderrFullPath = `/tmp/dust-exec-${execId}-stderr.log`;
    void sandbox
      .writeFile(
        auth,
        stderrFullPath,
        new TextEncoder().encode(execResult.value.stderr).buffer
      )
      .catch((err) =>
        logger.error({ err }, "Failed to write full stderr to sandbox")
      );
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

  const output = formatExecOutput(truncated, execResult.value.exitCode, {
    denyLogEntries,
    stdoutFullPath,
    stderrFullPath,
  });

  return new Ok([{ type: "text" as const, text: output }]);
}
