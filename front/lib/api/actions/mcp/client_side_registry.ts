import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { slugify } from "@app/types/shared/utils/string_utils";
import { randomBytes } from "crypto";

// TTL for MCP server registrations (10 minutes).
// Refreshed on every access via EXPIRE in validateMCPServerAccess, and by the client heartbeat
// (every 5 minutes) as a fallback.
const MCP_SERVER_REGISTRATION_TTL_SECONDS = 10 * 60;

// Number of attempts to allocate a serverId before giving up. Suffixes are 16 random hex
// characters, so a collision is virtually impossible
const MAX_REGISTRATION_ATTEMPTS = 3;

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
 * Get the base serverId by removing the per-registration suffix.
 * For example: "mcp-client-side:my-server.a1b2c3d4e5f60718" -> "mcp-client-side:my-server"
 * (legacy numeric suffixes like "mcp-client-side:my-server.1" are stripped too).
 * This is safe because:
 * 1. The suffix is always prefixed with a dot
 * 2. The base serverId is generated using slugify which removes dots
 * 3. The serverId format is strictly controlled by our code
 */
export function getBaseServerId(serverId: string): string {
  // Only remove suffix if it matches our strict pattern (dot followed by hex characters,
  // which also covers legacy numeric suffixes).
  return serverId.replace(/\.[0-9a-f]+$/, "");
}

export function getMCPServerIdFromServerName({
  serverName,
}: {
  serverName: string;
}): string {
  return `mcp-client-side:${slugify(serverName)}`;
}

/**
 * Interface for MCP server registration metadata.
 */
export interface MCPServerRegistration {
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
 * The serverId is the slugified serverName followed by a dot and a random hex suffix
 * (e.g., "mcp-client-side:my-server.a1b2c3d4e5f60718").
 *
 * The random suffix is what isolates concurrent registrations (e.g. multiple browser tabs
 * of the same user) from each other.
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

  for (let attempt = 0; attempt < MAX_REGISTRATION_ATTEMPTS; attempt++) {
    const suffix = randomBytes(8).toString("hex");
    const serverId = `${getMCPServerIdFromServerName({ serverName })}.${suffix}`;
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

    const result = await runOnRedis(
      { origin: "mcp_client_side_request" },
      async (redis) =>
        redis.set(key, JSON.stringify(metadata), {
          NX: true,
          EX: MCP_SERVER_REGISTRATION_TTL_SECONDS,
        })
    );

    if (result !== null) {
      const expiresAt = new Date(
        now + MCP_SERVER_REGISTRATION_TTL_SECONDS * 1000
      ).toISOString();

      return new Ok({
        expiresAt,
        serverId,
      });
    }
  }

  return new Err(
    new Error(`Failed to allocate a serverId for server "${serverName}"`)
  );
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
): Promise<Map<string, MCPServerRegistration | null>> {
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

    return new Map(
      serverIds.map((serverId, i) => {
        const result = results[i];
        // Server existence is checked when posting a message. It's safe to ignore here.
        return [serverId, result ? JSON.parse(result) : null];
      })
    );
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
        EX: MCP_SERVER_REGISTRATION_TTL_SECONDS,
      });

      return metadata;
    }
  );

  if (!result) {
    return null;
  }

  const expiresAt = new Date(
    now + MCP_SERVER_REGISTRATION_TTL_SECONDS * 1000
  ).toISOString();

  return {
    success: true,
    expiresAt,
  };
}

/**
 * Remove a client-side MCP server registration from Redis immediately.
 * Returns true if the key was present and deleted, false if it was already gone.
 */
export async function deregisterMCPServer(
  auth: Authenticator,
  { serverId }: { serverId: string }
): Promise<boolean> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const userModelId = auth.getNonNullableUser().id.toString();
  const key = getMCPServerRegistryKey({
    workspaceId,
    userId: userModelId,
    serverId,
  });

  const deleted = await runOnRedis(
    { origin: "mcp_client_side_request" },
    async (redis) => redis.del(key)
  );

  return deleted === 1;
}

/**
 * Validate that a server ID belongs to the current user in the given workspace.
 * Uses a single EXPIRE to atomically check existence and refresh the TTL.
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
    // EXPIRE returns true if the key exists (and refreshes TTL), false otherwise.
    return redis.expire(key, MCP_SERVER_REGISTRATION_TTL_SECONDS);
  });
}
