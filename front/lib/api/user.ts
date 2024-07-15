import type { UserMetadataType, UserType } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { User, UserMetadata } from "@app/lib/models/user";
import { UserResource } from "@app/lib/resources/user_resource";

import { MembershipResource } from "../resources/membership_resource";

export function renderUserType(user: User): UserType {
  return {
    sId: user.sId,
    id: user.id,
    createdAt: user.createdAt.getTime(),
    provider: user.provider,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.firstName + (user.lastName ? ` ${user.lastName}` : ""),
    image: user.imageUrl,
  };
}

/**
 * This function checks that the user had at least one membership in the past for this workspace
 * otherwise returns null, preventing retrieving user information from their sId.
 */
export async function getUserForWorkspace(
  auth: Authenticator,
  { userId }: { userId: string }
): Promise<UserType | null> {
  const owner = auth.workspace();
  if (!owner || !(auth.isAdmin() || auth.user()?.sId === userId)) {
    return null;
  }

  const userRes = await UserResource.fetchByExternalId(userId);

  if (!userRes) {
    return null;
  }

  const membership =
    await MembershipResource.getLatestMembershipOfUserInWorkspace({
      user: userRes.toUserType(),
      workspace: owner,
    });

  if (!membership) {
    return null;
  }

  return userRes.toUserType();
}

export async function deleteUser(user: UserType): Promise<void> {
  await User.destroy({
    where: {
      id: user.id,
    },
  });
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
  const metadata = await UserMetadata.findOne({
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
  const metadata = await UserMetadata.findOne({
    where: {
      userId: user.id,
      key: update.key,
    },
  });

  if (!metadata) {
    await UserMetadata.create({
      userId: user.id,
      key: update.key,
      value: update.value,
    });
    return;
  }

  metadata.value = update.value;
  await metadata.save();
}

export async function updateUserFullName({
  user,
  firstName,
  lastName,
}: {
  user: UserType;
  firstName: string;
  lastName: string;
}): Promise<boolean | null> {
  const u = await UserResource.fetchByModelId(user.id);

  if (!u) {
    return null;
  }

  await u.update({
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
  });

  return true;
}

export async function unsafeGetUsersByModelId(
  modelIds: number[]
): Promise<UserType[]> {
  if (modelIds.length === 0) {
    return [];
  }
  const users = await User.findAll({
    where: {
      id: modelIds,
    },
  });

  return users.map((u) => renderUserType(u));
}
