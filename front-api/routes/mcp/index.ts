import { mcpServerAuthMiddleware } from "@app/lib/api/mcp_server/auth";
import { buildMcpAuthInfo } from "@app/lib/api/mcp_server/context";
import { createDustMcpServer } from "@app/lib/api/mcp_server/server";
import logger from "@app/logger/logger";
import { createHono } from "@front-api/lib/hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Context } from "hono";

export const mcpApp = createHono();

function extractBearerToken(authHeader: string | undefined): string | null {
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

// @hono/mcp reads ctx.get("auth") as MCP AuthInfo. Use a dedicated setter so we
// do not clobber the Dust Authenticator that request_logger expects on "auth".
function setMcpTransportAuth(c: Context, authInfo: AuthInfo): void {
  c.set("auth", authInfo as never);
}

function clearMcpTransportAuth(c: Context): void {
  c.set("auth", undefined as never);
}

async function closeMcpServer(server: McpServer): Promise<void> {
  try {
    await server.close();
  } catch {
    // Ignore double-close races when transport hooks fire more than once.
  }
}

// Keep the server alive until SSE streams finish. Closing in `finally` right
// after handleRequest() returns aborts tools/list before the client reads it.
function wrapResponseWithCleanup(
  response: Response,
  cleanup: () => Promise<void>
): Response {
  if (!response.body) {
    void cleanup();
    return response;
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const reader = response.body.getReader();
  const writer = writable.getWriter();

  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        await writer.write(value);
      }
    } catch {
      // Client disconnected mid-stream.
    } finally {
      try {
        await writer.close();
      } catch {
        // ignore
      }
      await cleanup();
    }
  })();

  const headers = new Headers(response.headers);
  return new Response(readable, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleStatelessMcpRequest(
  c: Context,
  server: McpServer,
  transport: StreamableHTTPTransport
): Promise<Response | undefined> {
  const cleanup = () => closeMcpServer(server);
  const response = await transport.handleRequest(c);

  if (!response) {
    await cleanup();
    return response;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    return wrapResponseWithCleanup(response, cleanup);
  }

  await cleanup();
  return response;
}

// POST, GET, DELETE /mcp — all MCP protocol traffic from remote clients.
// Stateless: each HTTP request gets a fresh transport + server (no Mcp-Session-Id),
// so any front-api pod can handle any request without shared in-memory state.
mcpApp.all("/", mcpServerAuthMiddleware, async (c) => {
  const auth = c.get("mcpAuth");
  const token = extractBearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "unauthorized" }, 401);
  }

  logger.info(
    {
      userId: auth.user().sId,
      workspaceId: auth.workspace().sId,
      method: c.req.method,
    },
    "[dust-mcp-server] Inbound request"
  );

  const server = createDustMcpServer();
  const transport = new StreamableHTTPTransport({
    enableJsonResponse: true,
  });
  const mcpAuthInfo = buildMcpAuthInfo(auth, token);

  setMcpTransportAuth(c, mcpAuthInfo);
  try {
    await server.connect(transport);
    return await handleStatelessMcpRequest(c, server, transport);
  } catch (error) {
    await closeMcpServer(server);
    throw error;
  } finally {
    clearMcpTransportAuth(c);
  }
});
