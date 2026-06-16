import {
  getBaseServerId,
  getMCPServerIdFromServerName,
  validateMCPServerAccess,
} from "@app/lib/api/actions/mcp/client_side_registry";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { slugify } from "@app/types/shared/utils/string_utils";
import { z } from "zod";

export const DUST_DESKTOP_FEATURE_FLAG = "dust_desktop" as const;

/** Client-side MCP server name registered by Dust Desktop. */
export const DUST_DESKTOP_CLIENT_SIDE_MCP_SERVER_NAME = "dust-desktop";

export const DUST_DESKTOP_MCP_SERVER_METADATA_KEY = "dust_desktop:mcp_server";

/** Match Dust Desktop heartbeat interval (5 minutes). */
export const DUST_DESKTOP_MCP_SERVER_TTL_MS = 5 * 60 * 1000;

const DustDesktopMcpServerMetadataSchema = z.object({
  serverId: z.string(),
  updatedAt: z.number(),
});

type DustDesktopMcpServerMetadata = z.infer<
  typeof DustDesktopMcpServerMetadataSchema
>;

export function isDustDesktopClientSideMCPServerName(
  serverName: string
): boolean {
  return (
    slugify(serverName) === slugify(DUST_DESKTOP_CLIENT_SIDE_MCP_SERVER_NAME)
  );
}

export function isDustDesktopClientSideMCPServerId(serverId: string): boolean {
  return (
    getBaseServerId(serverId) ===
    getMCPServerIdFromServerName({
      serverName: DUST_DESKTOP_CLIENT_SIDE_MCP_SERVER_NAME,
    })
  );
}

/**
 * Persist the latest Dust Desktop client-side MCP server id for the current user
 * in this workspace. No-op unless the feature flag is enabled.
 */
export async function maybePersistDustDesktopClientSideMCPServerRegistration(
  auth: Authenticator,
  {
    serverName,
    serverId,
  }: {
    serverName?: string;
    serverId: string;
  }
): Promise<void> {
  const user = auth.user();
  if (!user) {
    return;
  }

  const isDustDesktop =
    (serverName !== undefined &&
      isDustDesktopClientSideMCPServerName(serverName)) ||
    isDustDesktopClientSideMCPServerId(serverId);

  if (!isDustDesktop) {
    return;
  }

  await user.setMetadata(
    DUST_DESKTOP_MCP_SERVER_METADATA_KEY,
    JSON.stringify(
      DustDesktopMcpServerMetadataSchema.parse({
        serverId,
        updatedAt: Date.now(),
      })
    ),
    auth.getNonNullableWorkspace().id
  );
}

/**
 * Remove persisted Dust Desktop MCP metadata when a server instance is deregistered.
 */
export async function clearDustDesktopClientSideMCPServerRegistration(
  auth: Authenticator,
  { serverId }: { serverId: string }
): Promise<void> {
  if (!isDustDesktopClientSideMCPServerId(serverId)) {
    return;
  }

  const user = auth.user();
  if (!user) {
    return;
  }

  const workspaceModelId = auth.getNonNullableWorkspace().id;
  const metadataRow = await user.getMetadata(
    DUST_DESKTOP_MCP_SERVER_METADATA_KEY,
    workspaceModelId
  );
  if (!metadataRow) {
    return;
  }

  let metadata: DustDesktopMcpServerMetadata;
  try {
    const parsed = DustDesktopMcpServerMetadataSchema.safeParse(
      JSON.parse(metadataRow.value)
    );
    if (!parsed.success) {
      return;
    }
    metadata = parsed.data;
  } catch {
    return;
  }

  if (metadata.serverId !== serverId) {
    return;
  }

  await user.deleteMetadata({
    key: DUST_DESKTOP_MCP_SERVER_METADATA_KEY,
    workspaceId: workspaceModelId,
  });
}

/**
 * Return the Dust Desktop client-side MCP server id for the current user when the
 * feature flag is enabled and the stored heartbeat is recent enough.
 */
export async function getActiveDustDesktopClientSideMCPServerId(
  auth: Authenticator
): Promise<string | null> {
  const user = auth.user();
  if (!user) {
    return null;
  }

  const hasDustDesktopFeatureFlag = await hasFeatureFlag(
    auth,
    DUST_DESKTOP_FEATURE_FLAG
  );
  if (!hasDustDesktopFeatureFlag) {
    return null;
  }

  const metadataRow = await user.getMetadata(
    DUST_DESKTOP_MCP_SERVER_METADATA_KEY,
    auth.getNonNullableWorkspace().id
  );
  if (!metadataRow) {
    return null;
  }

  let metadata: DustDesktopMcpServerMetadata;
  try {
    const parsed = DustDesktopMcpServerMetadataSchema.safeParse(
      JSON.parse(metadataRow.value)
    );
    if (!parsed.success) {
      return null;
    }
    metadata = parsed.data;
  } catch {
    return null;
  }

  if (Date.now() - metadata.updatedAt > DUST_DESKTOP_MCP_SERVER_TTL_MS) {
    return null;
  }

  const isRegistered = await validateMCPServerAccess(auth, {
    serverId: metadata.serverId,
  });
  if (!isRegistered) {
    return null;
  }

  return metadata.serverId;
}
