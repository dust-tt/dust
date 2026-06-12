import { randomUUID } from "node:crypto";

import { createDustMcpServer } from "@app/lib/api/mcp_server/server";
import { StreamableHTTPTransport } from "@hono/mcp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type McpSession = {
  sessionId: string | null;
  transport: StreamableHTTPTransport;
  server: McpServer;
};

const sessions = new Map<string, McpSession>();

export function getMcpSession(sessionId: string): McpSession | undefined {
  return sessions.get(sessionId);
}

export async function deleteMcpSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  sessions.delete(sessionId);
  try {
    await session.server.close();
  } catch {
    // Ignore double-close races when transport hooks fire more than once.
  }
}

export async function createMcpSession(): Promise<McpSession> {
  const server = createDustMcpServer();
  let session: McpSession | null = null;

  const transport = new StreamableHTTPTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId: string) => {
      if (!session) {
        return;
      }
      session.sessionId = sessionId;
      sessions.set(sessionId, session);
    },
  });

  session = {
    sessionId: null,
    transport,
    server,
  };

  transport.onclose = () => {
    const sessionId = transport.sessionId;
    if (sessionId) {
      void deleteMcpSession(sessionId);
    }
  };

  await server.connect(transport);

  return session;
}
