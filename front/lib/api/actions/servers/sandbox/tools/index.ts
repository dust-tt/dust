import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SANDBOX_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox/metadata";
import { generateSandboxExecToken } from "@app/lib/api/sandbox/access_tokens";
import type { ExecResult } from "@app/lib/api/sandbox/provider";
import type { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { Err, Ok } from "@app/types/shared/result";

const DEFAULT_WORKING_DIRECTORY = "/home/user";
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
    bash: async (
      { command, workingDirectory, timeoutMs },
      { auth, agentLoopContext }
    ) => {
      const conversation = agentLoopContext?.runContext?.conversation;
      if (!conversation) {
        return new Err(new MCPError("No conversation context available."));
      }

      const ensureResult = await SandboxResource.ensureActive(
        auth,
        conversation
      );
      if (ensureResult.isErr()) {
        return new Err(new MCPError(ensureResult.error.message));
      }

      const { sandbox } = ensureResult.value;

      const sandboxToken = generateSandboxExecToken(auth, {
        conversation,
        sandbox,
        expiryMs: DEFAULT_EXEC_TIMEOUT_MS,
      });

      const execResult = await sandbox.exec(auth, command, {
        workingDirectory: workingDirectory ?? DEFAULT_WORKING_DIRECTORY,
        timeoutMs: timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
        envVars: { DUST_SANDBOX_TOKEN: sandboxToken },
      });
      if (execResult.isErr()) {
        return new Err(new MCPError(execResult.error.message));
      }

      const output = formatExecOutput(execResult.value);

      return new Ok([{ type: "text" as const, text: output }]);
    },
  };

  return buildTools(SANDBOX_TOOLS_METADATA, handlers);
}
