import type { GongPermissionProfile } from "@connectors/connectors/gong/lib/gong_api";
import { getGongClient } from "@connectors/connectors/gong/lib/utils";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { normalizeError } from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

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
    return new Err(normalizeError(err));
  }
}
