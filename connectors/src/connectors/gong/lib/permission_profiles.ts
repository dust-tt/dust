import type { GongPermissionProfile } from "@connectors/connectors/gong/lib/gong_api";
import { getGongClient } from "@connectors/connectors/gong/lib/utils";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

const SUPPORTED_PERMISSION_LEVELS: readonly string[] = ["all", "none"];

function isSupportedPermissionLevel(permissionLevel: string): boolean {
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
          `Only "all" and "specific teams" profiles can be used.`,
    };
  });
}

export async function fetchPermissionProfileViews(
  connector: ConnectorResource
): Promise<GongPermissionProfileView[]> {
  const gongClient = await getGongClient(connector);
  const workspaces = await gongClient.getWorkspaces();
  const firstWorkspace = workspaces[0];
  if (!firstWorkspace) {
    return [];
  }
  const profiles = await gongClient.getPermissionProfiles({
    workspaceId: firstWorkspace.id,
  });
  return renderPermissionProfiles(profiles);
}
