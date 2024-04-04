import type { UserMetadataType, UserType } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { User, UserMetadata } from "@app/lib/models";

import { MembershipResource } from "../resources/membership_resource";

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

  const user = await User.findOne({
    where: {
      sId: userId,
    },
  });

  if (!user) {
    return null;
  }

  const membership =
    await MembershipResource.getLatestMembershipOfUserInWorkspace({
      userId: user.id,
      workspace: owner,
    });

  if (!membership) {
    return null;
  }

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
  const u = await User.findOne({
    where: {
      id: user.id,
    },
  });

  if (!u) {
    return null;
  }

  u.firstName = firstName;
  u.lastName = lastName;
  u.name = `${firstName} ${lastName}`;
  await u.save();

  return true;
}
