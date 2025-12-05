import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import { Err, Ok, slugify } from "@app/types";

// TTL for MCP server registrations (5 minutes).
const MCP_SERVER_REGISTRATION_TTL = 5 * 60;

const MAX_SERVER_INSTANCES = 256;

export class MCPServerInstanceLimitError extends Error {
  constructor(serverName: string) {
    super(
      `Maximum number of servers (${MAX_SERVER_INSTANCES}) with name "${serverName}" reached`
    );
    this.name = "MCPServerInstanceLimitError";
  }
}

/**
 * Generate a Redis key for MCP server registration.
 */
function getMCPServerRegistryKey({
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
 * Get the base serverId by removing any numeric suffix.
 * For example: "mcp-client-side:my-server.1" -> "mcp-client-side:my-server"
 * This is safe because:
 * 1. The suffix is always prefixed with a dot
 * 2. The base serverId is generated using slugify which removes dots
 * 3. The serverId format is strictly controlled by our code
 */
export function getBaseServerId(serverId: string): string {
  // Only remove suffix if it matches our strict pattern (dot followed by numbers)
  return serverId.replace(/\.\d+$/, "");
}

function getMCPServerIdFromServerName({
  serverName,
}: {
  serverName: string;
}): string {
  return `mcp-client-side:${slugify(serverName)}`;
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
 * Multiple servers can share the same serverName, but each must have a unique serverId.
 * If a serverName is already in use, a numeric suffix will be added to the serverId
 * to ensure uniqueness (e.g., "my-server", "my-server.1", "my-server.2").
 * The suffix is prefixed with a dot to ensure it can't be confused with the base serverId.
 */
export async function registerMCPServer(
  auth: Authenticator,
  {
    serverName,
    workspaceId,
  }: {
    serverName: string;
    workspaceId: string;
  }
): Promise<Result<{ expiresAt: string; serverId: string }, Error>> {
  const userId = auth.getNonNullableUser().id.toString();
  const now = Date.now();

  // Find an available serverId by adding a suffix if needed.
  let serverId = getMCPServerIdFromServerName({ serverName });
  let suffix = 1;
  let key = getMCPServerRegistryKey({
    workspaceId,
    userId,
    serverId,
  });

  // Keep trying with incremented suffixes until we find an available serverId.
  let serverIdFound = false;
  let attempts = 0;

  while (!serverIdFound && attempts < MAX_SERVER_INSTANCES) {
    const exists = await runOnRedis(
      { origin: "mcp_client_side_request" },
      async (redis) => {
        return redis.exists(key);
      }
    );

    if (!exists) {
      serverIdFound = true;
      break;
    }

    // Try next suffix, using a dot prefix to ensure it can't be confused with the base serverId.
    serverId = `${getMCPServerIdFromServerName({ serverName })}.${suffix}`;
    key = getMCPServerRegistryKey({
      workspaceId,
      userId,
      serverId,
    });
    suffix++;
    attempts++;
  }

  if (!serverIdFound) {
    return new Err(new MCPServerInstanceLimitError(serverName));
  }

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

  return new Ok({
    expiresAt,
    serverId,
  });
}

/**
 * Get server metadata for a given list of server IDs.
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
export async function updateMCPServerHeartbeat(
  auth: Authenticator,
  {
    serverId,
    workspaceId,
  }: {
    serverId: string;
    workspaceId: string;
  }
): Promise<{ success: boolean; expiresAt: string } | null> {
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
    serverId,
  }: {
    serverId: string;
  }
): Promise<boolean> {
  if (!serverId) {
    return false;
  }
  const workspaceId = auth.getNonNullableWorkspace().sId;

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
