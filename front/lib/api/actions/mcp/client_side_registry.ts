import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";

// TTL for MCP server registrations (5 minutes).
const MCP_SERVER_REGISTRATION_TTL = 5 * 60;

/**
 * Generate a Redis key for MCP server registration.
 */
export function getMCPServerRegistryKey({
  workspaceId,
  userId,
  serverId,
}: {
  workspaceId: string;
  userId: string;
  serverId: string;
}): string {
  return `w:${workspaceId}:mcp:reg:u:${userId}:s:${serverId}`;
}

/**
 * Interface for MCP server registration metadata.
 */
interface MCPServerRegistration {
  lastHeartbeat: number;
  registeredAt: number;
  serverId: string;
  serverName: string;
  userId: string;
  workspaceId: string;
}

/**
 * Register a new MCP server.
 */
export async function registerMCPServer(
  auth: Authenticator,
  {
    serverId,
    serverName,
    workspaceId,
  }: {
    serverId: string;
    serverName: string;
    workspaceId: string;
  }
): Promise<{ success: boolean; expiresAt: string }> {
  const userId = auth.getNonNullableUser().id.toString();
  const now = Date.now();

  const key = getMCPServerRegistryKey({
    workspaceId,
    userId,
    serverId,
  });

  const metadata: MCPServerRegistration = {
    lastHeartbeat: now,
    registeredAt: now,
    serverId,
    serverName,
    userId,
    workspaceId,
  };

  await runOnRedis({ origin: "mcp_client_side_request" }, async (redis) => {
    await redis.set(key, JSON.stringify(metadata), {
      EX: MCP_SERVER_REGISTRATION_TTL,
    });
  });

  const expiresAt = new Date(
    now + MCP_SERVER_REGISTRATION_TTL * 1000
  ).toISOString();

  return {
    success: true,
    expiresAt,
  };
}

/**
 * Get server metadata for a given server ID.
 */
export async function getMCPServersMetadata(
  auth: Authenticator,
  {
    serverIds,
  }: {
    serverIds: string[];
  }
): Promise<(MCPServerRegistration | null)[]> {
  const userId = auth.getNonNullableUser().id.toString();
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const keys = serverIds.map((serverId) =>
    getMCPServerRegistryKey({
      serverId,
      userId,
      workspaceId,
    })
  );

  return runOnRedis({ origin: "mcp_client_side_request" }, async (redis) => {
    const results = await redis.mGet(keys);

    return results.map((result) => {
      // Server existence is checked when posting a message. It's safe to ignore here.
      if (!result) {
        return null;
      }

      return JSON.parse(result);
    });
  });
}

/**
 * Update heartbeat for an existing MCP server.
 */
export async function updateMCPServerHeartbeat({
  auth,
  workspaceId,
  serverId,
}: {
  auth: Authenticator;
  workspaceId: string;
  serverId: string;
}): Promise<{ success: boolean; expiresAt: string } | null> {
  const userId = auth.getNonNullableUser().id.toString();
  const now = Date.now();

  const key = getMCPServerRegistryKey({
    workspaceId,
    userId,
    serverId,
  });

  // Get existing registration and update it.
  const result = await runOnRedis(
    { origin: "mcp_client_side_request" },
    async (redis) => {
      // Get existing registration.
      const existing = await redis.get(key);
      if (!existing) {
        return null;
      }

      // Update heartbeat.
      const metadata: MCPServerRegistration = JSON.parse(existing);
      metadata.lastHeartbeat = now;

      // Update in Redis with refreshed TTL.
      await redis.set(key, JSON.stringify(metadata), {
        EX: MCP_SERVER_REGISTRATION_TTL,
      });

      return true;
    }
  );

  if (!result) {
    return null;
  }

  const expiresAt = new Date(
    now + MCP_SERVER_REGISTRATION_TTL * 1000
  ).toISOString();

  return {
    success: true,
    expiresAt,
  };
}

/**
 * Validate that a server ID belongs to the current user in the given workspace.
 */
export async function validateMCPServerAccess(
  auth: Authenticator,
  {
    workspaceId,
    serverId,
  }: {
    workspaceId: string;
    serverId: string;
  }
): Promise<boolean> {
  if (!serverId) {
    return false;
  }

  const userId = auth.getNonNullableUser().id.toString();
  const key = getMCPServerRegistryKey({
    workspaceId,
    userId,
    serverId,
  });

  return runOnRedis({ origin: "mcp_client_side_request" }, async (redis) => {
    const exists = await redis.exists(key);

    if (exists) {
      // Update last heartbeat time and extend TTL when accessed.
      const existing = await redis.get(key);
      if (existing) {
        const metadata: MCPServerRegistration = JSON.parse(existing);
        metadata.lastHeartbeat = Date.now();

        await redis.set(key, JSON.stringify(metadata), {
          EX: MCP_SERVER_REGISTRATION_TTL,
        });
      }
    }

    return exists === 1;
  });
}
