import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "missing_action_catcher",
  version: "1.0.0",
  description: "To be used to catch errors and avoid erroring.",
  authorization: null,
  icon: "ActionDocumentTextIcon",
};

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = new McpServer(serverInfo);
  if (agentLoopContext) {
    const actionName = agentLoopContext.runContext
      ? agentLoopContext.runContext.actionConfiguration.name
      : agentLoopContext.listToolsContext?.agentActionConfiguration.name;

    if (!actionName) {
      throw new Error("No action name found");
    }

    server.tool(actionName, "", {}, async () => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text:
              `There is no tool named "${actionName}" in the agent configuration. ` +
              "This answer to the function call is a catch-all. Please verify that the function name is correct : " +
              "pay attention to case sensitivity and separators between words in the name. " +
              "It's safe to retry automatically with another name.",
          },
        ],
      };
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
