import type {
  Result,
  RoleType,
  UserMetadataType,
  UserType,
  UserTypeWithWorkspaces,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { UserMetadataModel } from "@app/lib/resources/storage/models/user";
import { UserResource } from "@app/lib/resources/user_resource";
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

/**
 * Server-side interface to get user metadata.
 * @param user UserType the user to get metadata for.
 * @param key string the key of the metadata to get.
 * @returns UserMetadataType | null
 */
export async function getUserMetadata(
  user: UserType,
  key: string
): Promise<UserMetadataType | null> {
  const metadata = await UserMetadataModel.findOne({
    where: {
      userId: user.id,
      key,
    },
  });

  if (!metadata) {
    return null;
  }

  return {
    key: metadata.key,
    value: metadata.value,
  };
}

/**
 * Server-side interface to set user metadata.
 * @param user UserType the user to get metadata for.
 * @param update UserMetadata the metadata to set for the user.
 * @returns UserMetadataType | null
 */
export async function setUserMetadata(
  user: UserType,
  update: UserMetadataType
): Promise<void> {
  const metadata = await UserMetadataModel.findOne({
    where: {
      userId: user.id,
      key: update.key,
    },
  });

  if (!metadata) {
    await UserMetadataModel.create({
      userId: user.id,
      key: update.key,
      value: update.value,
    });
    return;
  }

  metadata.value = update.value;
  await metadata.save();
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

export async function getUserWithWorkspaces(
  user: UserResource
): Promise<UserTypeWithWorkspaces> {
  const { memberships } = await MembershipResource.getActiveMemberships({
    users: [user],
  });
  const workspaces = await Workspace.findAll({
    where: {
      id: memberships.map((m) => m.workspaceId),
    },
  });

  return {
    ...user.toJSON(),
    workspaces: workspaces.map((w) => {
      const m = memberships.find((m) => m.workspaceId === w.id);
      let role = "none" as RoleType;
      if (m) {
        switch (m.role) {
          case "admin":
          case "builder":
          case "user":
            role = m.role;
            break;
          default:
            role = "none";
        }
      }
      return {
        id: w.id,
        sId: w.sId,
        name: w.name,
        role,
        segmentation: w.segmentation || null,
        whiteListedProviders: w.whiteListedProviders,
        defaultEmbeddingProvider: w.defaultEmbeddingProvider,
      };
    }),
  };
}
