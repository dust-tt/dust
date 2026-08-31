import type { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  GrantType,
  GroupPermissionResourceType,
} from "@app/types/group_permissions";
import type { GroupKind } from "@app/types/groups";
import { removeNulls } from "@app/types/shared/utils/general";

export type PokeGroupPermissionType = {
  grantType: GrantType;
  resourceType: GroupPermissionResourceType;
  resourceId: number;
  group: {
    sId: string;
    name: string;
    kind: GroupKind;
  };
};

export type PokeListGroupPermissions = {
  groupPermissions: PokeGroupPermissionType[];
};

// Resolve the group referenced by each grant (one batched fetch) and serialize. Grants whose group
// cannot be resolved are dropped rather than surfaced without a link target.
async function serializeGroupPermissions(
  auth: Authenticator,
  groupPermissions: GroupPermissionResource[]
): Promise<PokeGroupPermissionType[]> {
  const groupModelIds = [...new Set(groupPermissions.map((gp) => gp.groupId))];
  const groups = await GroupResource.dangerouslyFetchByModelIds(
    auth,
    groupModelIds
  );
  const groupByModelId = new Map(groups.map((group) => [group.id, group]));

  return removeNulls(
    groupPermissions.map((gp) => {
      const group = groupByModelId.get(gp.groupId);
      return group ? gp.toPokeJSON(group) : null;
    })
  );
}

// Grants that apply to one resource instance: its own rows plus the type-wide (-1) rows that apply
// to every instance of the type.
export async function getPokeGroupPermissionsForResource(
  auth: Authenticator,
  {
    resourceType,
    resourceId,
  }: {
    resourceType: GroupPermissionResourceType;
    resourceId: number;
  }
): Promise<PokeGroupPermissionType[]> {
  const groupPermissions = await GroupPermissionResource.listForResource(auth, {
    resourceType,
    resourceId,
  });
  return serializeGroupPermissions(auth, groupPermissions);
}

// Every grant held by one group, across resource types and instances.
export async function getPokeGroupPermissionsForGroup(
  auth: Authenticator,
  group: GroupResource
): Promise<PokeGroupPermissionType[]> {
  const groupPermissions = await GroupPermissionResource.listForGroup(
    auth,
    group
  );
  return serializeGroupPermissions(auth, groupPermissions);
}
