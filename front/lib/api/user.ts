import { UserMetadata } from "@app/lib/models";
import { UserMetadataType, UserType } from "@app/types/user";

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
