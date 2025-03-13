import type {
  Result,
  UserTypeWithExtensionWorkspaces,
  UserTypeWithWorkspaces,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

import { MembershipResource } from "../resources/membership_resource";

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
): Promise<Result<Workspace, Error>> {
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
  const workspace = await Workspace.findByPk(revokedWorkspaceId);

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
  const workspaceIds = memberships.map((m) => m.workspaceId);
  const workspaces = await Workspace.findAll({
    where: {
      id: workspaceIds,
    },
  });

  const configs = populateExtensionConfig
    ? await ExtensionConfigurationResource.internalFetchForWorkspaces(
        workspaceIds
      )
    : [];

  return {
    ...user.toJSON(),
    workspaces: workspaces.map((w) => {
      return {
        ...renderLightWorkspaceType({
          workspace: w,
          role: memberships.find((m) => m.workspaceId === w.id)?.role ?? "none",
        }),
        ssoEnforced: w.ssoEnforced,
        ...(populateExtensionConfig && {
          blacklistedDomains:
            configs.find((c) => c.workspaceId === w.id)?.blacklistedDomains ??
            null,
        }),
      };
    }),
  };
}
