import { MembershipResource } from "@app/lib/resources/membership_resource";
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
      if (existingUser.sId !== userAsset.sId) {
        logger.warn(
          { sId: existingUser.sId, assetId: userAsset.sId },
          "Existing user has a different sId than the asset: assets referencing the asset sId " +
            "(e.g. skill editors suggestions) will not resolve to this user"
        );
      }
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
      // Seeded users use the asset sId so other assets can reference them directly.
      const user = await UserResource.makeNew({
        sId: userAsset.sId,
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
