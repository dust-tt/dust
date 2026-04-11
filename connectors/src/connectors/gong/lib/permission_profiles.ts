import { GongAPIError } from "@connectors/connectors/gong/lib/errors";
import type { GongPermissionProfile } from "@connectors/connectors/gong/lib/gong_api";
import { getGongClient } from "@connectors/connectors/gong/lib/utils";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import mainLogger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { normalizeError } from "@connectors/types";

type PermissionLevel = GongPermissionProfile["callsAccess"]["permissionLevel"];

const SUPPORTED_PERMISSION_LEVELS: readonly PermissionLevel[] = ["all", "none"];

function isSupportedPermissionLevel(permissionLevel: PermissionLevel): boolean {
  return SUPPORTED_PERMISSION_LEVELS.includes(permissionLevel);
}

export interface GongPermissionProfileView {
  id: string;
  name: string;
  permissionLevel: string;
  supported: boolean;
  reason: string | null;
}

export function renderPermissionProfiles(
  profiles: GongPermissionProfile[]
): GongPermissionProfileView[] {
  return profiles.map((p) => {
    const { permissionLevel } = p.callsAccess;
    const supported = isSupportedPermissionLevel(permissionLevel);

    return {
      id: p.id,
      name: p.name,
      permissionLevel,
      supported,
      reason: supported
        ? null
        : `Permission level "${permissionLevel}" is not supported. ` +
          `Only profiles with "all" or "specific teams" access can be used as participant filters.`,
    };
  });
}

const logger = mainLogger.child({ provider: "gong" });

export async function fetchPermissionProfileViews(
  connector: ConnectorResource
): Promise<Result<GongPermissionProfileView[], Error>> {
  try {
    const gongClient = await getGongClient(connector);
    const workspaces = await gongClient.getWorkspaces();
    const firstWorkspace = workspaces[0];
    if (!firstWorkspace) {
      return new Ok([]);
    }
    const profiles = await gongClient.getPermissionProfiles({
      workspaceId: firstWorkspace.id,
    });
    return new Ok(renderPermissionProfiles(profiles));
  } catch (err) {
    if (err instanceof ExternalOAuthTokenError) {
      logger.error(
        { connectorId: connector.id },
        "[Gong] OAuth token error when fetching permission profiles."
      );
      return new Err(
        new Error(
          "Gong authorization error when fetching permission profiles. Please re-authorize the connection."
        )
      );
    }
    if (err instanceof GongAPIError) {
      logger.error(
        { connectorId: connector.id, error: err.toString() },
        "[Gong] API error when fetching permission profiles."
      );
      return new Err(
        new Error(
          `Gong API error when fetching permission profiles: ${err.message}`
        )
      );
    }
    logger.error(
      { connectorId: connector.id, error: normalizeError(err).message },
      "[Gong] Unexpected error when fetching permission profiles."
    );
    return new Err(normalizeError(err));
  }
}
