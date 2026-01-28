import { MembershipResource } from "@app/lib/resources/membership_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";

import type { SeedContext, UserAsset } from "./types";

export async function seedUsers(
  ctx: SeedContext,
  userAssets: UserAsset[]
): Promise<Map<string, UserResource>> {
  const { workspace, execute, logger } = ctx;
  const createdUsers = new Map<string, UserResource>();

  for (const userAsset of userAssets) {
    // Check if user already exists by email
    const existingUser = await UserResource.fetchByEmail(userAsset.email);

    if (existingUser) {
      logger.info(
        { sId: existingUser.sId, email: userAsset.email },
        "User already exists, skipping creation"
      );
      createdUsers.set(userAsset.sId, existingUser);
      continue;
    }

    if (execute) {
      const user = await UserResource.makeNew({
        sId: generateRandomModelSId(),
        workOSUserId: `workos-${userAsset.sId}`,
        provider: "google",
        providerId: `provider-${userAsset.sId}`,
        username: userAsset.username,
        email: userAsset.email,
        name: `${userAsset.firstName} ${userAsset.lastName}`.trim(),
        firstName: userAsset.firstName,
        lastName: userAsset.lastName,
        lastLoginAt: new Date(),
      });

      // Add user as member of the workspace
      await MembershipResource.createMembership({
        user,
        workspace,
        role: "user",
      });

      logger.info({ sId: user.sId, email: userAsset.email }, "User created");
      createdUsers.set(userAsset.sId, user);
    }
  }

  return createdUsers;
}
