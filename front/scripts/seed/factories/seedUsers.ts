import { MembershipResource } from "@app/lib/resources/membership_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
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
      // The user may exist without being a member of the workspace, for instance when a previous
      // seed run created them and failed before the rest of the seed. Everything downstream needs
      // the membership, so add it back.
      const membership =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user: existingUser,
          workspace,
        });
      if (!membership && execute) {
        await MembershipResource.createMembership({
          user: existingUser,
          workspace,
          role: "user",
        });
        logger.info(
          { sId: existingUser.sId, email: userAsset.email },
          "Membership created for existing user"
        );
      }
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
