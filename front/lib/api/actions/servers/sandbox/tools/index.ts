import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SANDBOX_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox/metadata";
import type { Authenticator } from "@app/lib/auth";
import { Err } from "@app/types/shared/result";

export function createSandboxTools(
  _auth: Authenticator,
  _agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof SANDBOX_TOOLS_METADATA> = {
    execute: async (_args) => {
      return new Err(
        new MCPError("Sandbox execute tool is not implemented yet.")
      );
    },

    write_file: async (_args) => {
      return new Err(
        new MCPError("Sandbox write_file tool is not implemented yet.")
      );
    },

    read_file: async (_args) => {
      return new Err(
        new MCPError("Sandbox read_file tool is not implemented yet.")
      );
    },

    list_files: async (_args) => {
      return new Err(
        new MCPError("Sandbox list_files tool is not implemented yet.")
      );
    },
  };

  return buildTools(SANDBOX_TOOLS_METADATA, handlers);
}
