import { mcpServerAuthMiddleware } from "@app/lib/api/mcp_server/auth";
import { buildMcpAuthInfo } from "@app/lib/api/mcp_server/context";
import type { WorkOSWorkspaceAuthenticator } from "@app/lib/api/workos_authenticator";
import logger from "@app/logger/logger";
import { createHono } from "@front-api/lib/hono";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Context } from "hono";

import { createMcpSession, getMcpSession } from "./sessions";

export const mcpApp = createHono();

type McpSessionFailureReason =
  | "unknown_session"
  | "no_session"
  | "missing_session_id_after_init";

function logMcpSessionFailure(
  auth: WorkOSWorkspaceAuthenticator,
  {
    method,
    mcpSessionId,
    reason,
  }: {
    method: string;
    mcpSessionId: string | undefined;
    reason: McpSessionFailureReason;
  }
) {
  logger.warn(
    {
      userId: auth.user().sId,
      workspaceId: auth.workspace().sId,
      method,
      mcpSessionId: mcpSessionId ?? null,
      reason,
    },
    "[dust-mcp-server] MCP session resolution failed"
  );
}

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

// POST, GET, DELETE /mcp — all MCP protocol traffic from remote clients.
mcpApp.all("/", mcpServerAuthMiddleware, async (c) => {
  const auth = c.get("mcpAuth");
  const token = extractBearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const sessionIdHeader = c.req.header("mcp-session-id");
  let parsedBody: unknown | undefined;

  let session = sessionIdHeader ? getMcpSession(sessionIdHeader) : undefined;

  if (!session) {
    if (sessionIdHeader) {
      logMcpSessionFailure(auth, {
        method: c.req.method,
        mcpSessionId: sessionIdHeader,
        reason: "unknown_session",
      });
      return c.json(
        {
          error: "not_found",
          error_description: "MCP session not found",
        },
        404
      );
    }

    if (c.req.method !== "POST") {
      logMcpSessionFailure(auth, {
        method: c.req.method,
        mcpSessionId: sessionIdHeader,
        reason: "no_session",
      });
      return c.json(
        {
          error: "invalid_request",
          error_description: "Bad Request: No valid MCP session",
        },
        400
      );
    }

    parsedBody = await c.req.json();
    const messages = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
    if (!messages.some(isInitializeRequest)) {
      logMcpSessionFailure(auth, {
        method: c.req.method,
        mcpSessionId: sessionIdHeader,
        reason: "missing_session_id_after_init",
      });
      return c.json(
        {
          error: "invalid_request",
          error_description:
            "Bad Request: Mcp-Session-Id header is required after initialization",
        },
        400
      );
    }

    session = await createMcpSession();
  }

  logger.info(
    {
      userId: auth.user().sId,
      workspaceId: auth.workspace().sId,
      sessionId: sessionIdHeader ?? session.sessionId,
      method: c.req.method,
    },
    "[dust-mcp-server] Inbound request"
  );

  const mcpAuthInfo = buildMcpAuthInfo(auth, token);

  setMcpTransportAuth(c, mcpAuthInfo);
  try {
    return await (parsedBody !== undefined
      ? session.transport.handleRequest(c, parsedBody)
      : session.transport.handleRequest(c));
  } finally {
    clearMcpTransportAuth(c);
  }
});
