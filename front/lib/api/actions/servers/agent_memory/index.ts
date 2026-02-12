import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/api/actions/servers/agent_memory/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/agent_memory/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(AGENT_MEMORY_SERVER_NAME);

  // For now we only support user-scoped memory, the code below allows to support agent-level memory
  // which is somewhat dangerous as it can leak data across users while use cases are not completely
  // obvious for now.
  const user = auth.user();

  if (!user) {
    // If we are executed without users yet the memory is user scoped we show to the model that the
    // memory functions are not available.
    server.tool(
      "memory_not_available",
      "Memory is configured to be scoped to users but no user is currently authenticated.",
      {},
      // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
      async () => {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "No user memory available as there is no user authenticated.",
            },
          ],
        };
      }
    );
    return server;
  }

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: AGENT_MEMORY_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;
