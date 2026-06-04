import { mcpServerAuthMiddleware } from "@app/lib/api/mcp_server/auth";
import { runWithMcpContext } from "@app/lib/api/mcp_server/context";
import { createDustMcpServer } from "@app/lib/api/mcp_server/server";
import logger from "@app/logger/logger";
import { createHono } from "@front-api/lib/hono";
import { StreamableHTTPTransport } from "@hono/mcp";

const dustMcpServer = createDustMcpServer();
const transport = new StreamableHTTPTransport();

export const mcpApp = createHono();

// POST, GET, DELETE /mcp — all MCP protocol traffic from remote clients.
mcpApp.all("/", mcpServerAuthMiddleware, async (c) => {
  if (!dustMcpServer.isConnected()) {
    await dustMcpServer.connect(transport);
  }

  const user = c.get("mcpUser");
  const auth = c.get("mcpAuth");
  logger.info(
    { userId: user.sub, workspaceId: auth.workspace()?.sId },
    "[dust-mcp-server] Inbound request"
  );

  return runWithMcpContext({ auth }, () => transport.handleRequest(c));
});
