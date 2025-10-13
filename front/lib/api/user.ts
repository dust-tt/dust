import type { Authenticator } from "@app/lib/auth";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import {
  ADMIN_GROUP_NAME,
  BUILDER_GROUP_NAME,
  GroupResource,
} from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type {
  LightWorkspaceType,
  MembershipRoleType,
  Result,
  UserTypeWithExtensionWorkspaces,
  UserTypeWithWorkspaces,
} from "@app/types";
import { Err, Ok } from "@app/types";

import { MembershipResource } from "../resources/membership_resource";
import { findWorkOSOrganizationsForUserId } from "./workos/organization_membership";

/**
 * This function checks that the user had at least one membership in the past for this workspace
 * otherwise returns null, preventing retrieving user information from their sId.
 */
export async function getUserForWorkspace(
  auth: Authenticator,
  { userId }: { userId: string }
): Promise<UserResource | null> {
  const owner = auth.workspace();
  if (!owner || !(auth.isAdmin() || auth.user()?.sId === userId)) {
    return null;
  }

  const user = await UserResource.fetchById(userId);

  if (!user) {
    return null;
  }

  const membership =
    await MembershipResource.getLatestMembershipOfUserInWorkspace({
      user,
      workspace: owner,
    });

  if (!membership) {
    return null;
  }

  return user;
}

export async function fetchRevokedWorkspace(
  user: UserTypeWithWorkspaces
): Promise<Result<WorkspaceResource, Error>> {
  // TODO(@fontanierh): this doesn't look very solid as it will start to behave
  // weirdly if a user has multiple revoked memberships.
  const u = await UserResource.fetchByModelId(user.id);

  if (!u) {
    const message = "Unreachable: user not found.";
    logger.error({ userId: user.id }, message);
    return new Err(new Error(message));
  }

  const { memberships, total } = await MembershipResource.getLatestMemberships({
    users: [u],
  });

  if (total === 0) {
    const message = "Unreachable: user has no memberships.";
    logger.error({ userId: user.id }, message);
    return new Err(new Error(message));
  }

  const revokedWorkspaceId = memberships[0].workspaceId;
  const workspace = await WorkspaceResource.fetchByModelId(revokedWorkspaceId);

  if (!workspace) {
    const message = "Unreachable: workspace not found.";
    logger.error({ userId: user.id, workspaceId: revokedWorkspaceId }, message);
    return new Err(new Error(message));
  }

  return new Ok(workspace);
}

export async function getUserWithWorkspaces<T extends boolean>(
  user: UserResource,
  populateExtensionConfig: T = false as T
): Promise<
  T extends true ? UserTypeWithExtensionWorkspaces : UserTypeWithWorkspaces
> {
  const { memberships } = await MembershipResource.getActiveMemberships({
    users: [user],
  });
  const workspaceModelIds = memberships.map((m) => m.workspaceId);
  const workspaces = await WorkspaceResource.fetchByModelIds(workspaceModelIds);

  const configs = populateExtensionConfig
    ? await ExtensionConfigurationResource.internalFetchForWorkspaces(
        workspaceModelIds
      )
    : [];

  const organizations = user.workOSUserId
    ? await findWorkOSOrganizationsForUserId(user.workOSUserId)
    : [];

  return {
    ...user.toJSON(),
    organizations: organizations.map((org) => ({
      id: org.id,
      name: org.name,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      metadata: org.metadata,
      externalId: org.externalId,
    })),
    workspaces: workspaces.map((w) => {
      return {
        ...renderLightWorkspaceType({
          workspace: w,
          role: memberships.find((m) => m.workspaceId === w.id)?.role ?? "none",
        }),
        ssoEnforced: w.ssoEnforced,
        workOSOrganizationId: w.workOSOrganizationId,
        ...(populateExtensionConfig && {
          blacklistedDomains:
            configs.find((c) => c.workspaceId === w.id)?.blacklistedDomains ??
            null,
        }),
      };
    }),
  };
}

export async function determineUserRoleFromGroups(
  workspace: LightWorkspaceType,
  user: UserResource
): Promise<MembershipRoleType> {
  // Get all groups the user is a member of.
  const userGroups = await GroupResource.listUserGroupsInWorkspace({
    user,
    workspace,
  });

  let atLeastBuilder = false;

  for (const group of userGroups) {
    if (group.name === ADMIN_GROUP_NAME) {
      return "admin";
    }
    if (group.name === BUILDER_GROUP_NAME) {
      atLeastBuilder = true;
    }
  }
  // If we're here, the user is not in the admin group.
  if (atLeastBuilder) {
    return "builder";
  }

  // Did not find any group granting a role, so the user should be a regular user.
  return "user";
}
