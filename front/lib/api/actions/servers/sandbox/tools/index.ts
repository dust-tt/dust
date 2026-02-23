import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SANDBOX_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox/metadata";
import { getSandboxProvider } from "@app/lib/api/sandbox";
import type { Authenticator } from "@app/lib/auth";
import { Err } from "@app/types/shared/result";

export function createSandboxTools(
  _auth: Authenticator,
  _agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof SANDBOX_TOOLS_METADATA> = {
    bash: async (_args) => {
      const provider = getSandboxProvider();
      if (!provider) {
        return new Err(new MCPError("Sandbox provider not configured."));
      }

      // TODO(SANDBOX-S1-T6): call provider.exec() once the E2B adapter is implemented.
      return new Err(new MCPError("Sandbox bash tool is not implemented yet."));
    },
  };

  return buildTools(SANDBOX_TOOLS_METADATA, handlers);
}
