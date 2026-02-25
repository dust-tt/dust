import { generateUserProjectDigest } from "@app/lib/api/projects/butler";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserProjectDigestResource } from "@app/lib/resources/user_project_digest_resource";
import logger from "@app/logger/logger";

/**
 * Activity to generate a user project digest using a direct LLM call.
 *
 * This fetches unread conversations for the project space, calls the LLM
 * to generate a digest, and saves the result.
 */
export async function generateUserProjectDigestActivity(
  authType: AuthenticatorType,
  {
    spaceId,
  }: {
    spaceId: string;
  }
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }
  const auth = authResult.value;

  // Fetch the space.
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    logger.warn({ spaceId }, "Space not found");
    throw new Error(`Space with id ${spaceId} not found`);
  }

  const digest = await generateUserProjectDigest(auth, { space });

  // Create and save the digest.
  await UserProjectDigestResource.create(auth, {
    spaceId: space.id,
    digest,
  });

  logger.info(
    {
      spaceId: space.sId,
      digestLength: digest.length,
    },
    "User project digest created successfully"
  );
}
