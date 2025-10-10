import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("missing_action_catcher");
  if (agentLoopContext) {
    const actionName = agentLoopContext.runContext
      ? agentLoopContext.runContext.toolConfiguration.name
      : agentLoopContext.listToolsContext?.agentActionConfiguration.name;

    if (!actionName) {
      throw new Error("No action name found");
    }

    server.tool(
      actionName,
      "",
      {},
      withToolLogging(
        auth,
        { toolName: actionName, agentLoopContext },
        async () => {
          return new Err(
            new MCPError(
              `Tool "${actionName}" not found. ` +
                "This answer to the function call is a catch-all. " +
                "Please verify that the function name is correct : " +
                "pay attention to case sensitivity and separators between words in the name. " +
                "It's safe to retry automatically with another name.",
              { tracked: false }
            )
          );
        }
      )
    );
  } else {
    server.tool(
      "placeholder_tool",
      "This tool is a placeholder to catch missing actions.",
      {},
      withToolLogging(auth, { toolName: "placeholder_tool" }, async () => {
        return new Ok([{ type: "text", text: "No action name found" }]);
      })
    );
  }
  return server;
};

export default createServer;
