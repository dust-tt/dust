import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  makeInternalMCPServer,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";

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

    server.tool(actionName, "", {}, async () => {
      return makeMCPToolTextError(
        `Tool "${actionName}" not found. ` +
          "This answer to the function call is a catch-all. " +
          "Please verify that the function name is correct : " +
          "pay attention to case sensitivity and separators between words in the name. " +
          "It's safe to retry automatically with another name."
      );
    });
  } else {
    server.tool(
      "placeholder_tool",
      "This tool is a placeholder to catch missing actions.",
      {},
      async () => {
        return {
          isError: false,
          content: [{ type: "text", text: "No action name found" }],
        };
      }
    );
  }
  return server;
};

export default createServer;
