import { CommandExitError } from "e2b";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SANDBOX_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox/metadata";
import { getSandboxProvider } from "@app/lib/api/sandbox";
import { ensureSandboxActive } from "@app/lib/api/sandbox/lifecycle";
import type { ExecResult } from "@app/lib/api/sandbox/provider";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types/shared/result";

const MAX_OUTPUT_LINES = 2_000;
const MAX_OUTPUT_BYTES = 50_000;

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
      const provider = getSandboxProvider();
      if (!provider) {
        return new Err(new MCPError("Sandbox provider not configured."));
      }

      const conversation = agentLoopContext?.runContext?.conversation;
      if (!conversation) {
        return new Err(new MCPError("No conversation context available."));
      }

      const result = await ensureSandboxActive(auth, conversation.id, provider);
      if (result.isErr()) {
        return new Err(new MCPError(result.error.message));
      }

      const { sandbox } = result.value;

      let execResult: ExecResult;
      try {
        execResult = await provider.exec(sandbox.providerId, command, {
          workingDirectory: workingDirectory ?? "/home/user",
          timeoutMs: timeoutMs ?? 60_000,
        });
      } catch (err) {
        // The E2B SDK throws CommandExitError on non-zero exit codes.
        // We still want to return stdout/stderr to the model.
        if (err instanceof CommandExitError) {
          execResult = {
            exitCode: err.exitCode,
            stdout: err.stdout,
            stderr: err.stderr,
          };
        } else {
          const message =
            err instanceof Error ? err.message : "Command execution failed.";
          return new Err(new MCPError(message));
        }
      }

      const output = formatExecOutput(execResult);

      return new Ok([{ type: "text" as const, text: output }]);
    },
  };

  return buildTools(SANDBOX_TOOLS_METADATA, handlers);
}
