/**
 * Seeds a development database with a user, workspace, and subscription.
 * Called by dust-hive during `warm` to set up a ready-to-use dev environment.
 *
 * SAFETY: Only runs when NODE_ENV=development.
 */

import { createAndLogMembership } from "@app/lib/api/signup";
import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { FREE_UPGRADED_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { UserResource } from "@app/lib/resources/user_resource";
import type { UserProviderType } from "@app/types";

interface SeedUserConfig {
  sId: string;
  username: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string | null;
  workOSUserId: string | null;
  provider: string | null;
  providerId: string | null;
  imageUrl: string | null;
  workspaceSId: string;
  workspaceName: string;
}

async function main() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      `This script can only run in development. Current NODE_ENV: ${process.env.NODE_ENV}`
    );
  }

  const configPath = process.argv[2];
  if (!configPath) {
    console.error("Usage: npx tsx admin/seed_dev_user.ts <config-file-path>");
    process.exit(1);
  }

  console.log("Seeding dev database...");

  const configFile = Bun.file(configPath);
  if (!(await configFile.exists())) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const config: SeedUserConfig = await configFile.json();

  // Check if user already exists
  let user: UserResource | null = null;
  if (config.workOSUserId) {
    user = await UserResource.fetchByWorkOSUserId(config.workOSUserId);
  }
  if (!user) {
    user = await UserResource.fetchByEmail(config.email);
  }

  if (!user) {
    // Create new user with isDustSuperUser = true
    const userModel = await UserModel.create({
      sId: config.sId,
      username: config.username,
      email: config.email.toLowerCase(),
      name: config.name,
      firstName: config.firstName,
      lastName: config.lastName,
      workOSUserId: config.workOSUserId,
      provider: config.provider as UserProviderType,
      providerId: config.providerId,
      imageUrl: config.imageUrl,
      isDustSuperUser: true,
    });

    user = await UserResource.fetchById(userModel.sId);
    if (!user) {
      throw new Error("Failed to fetch newly created user");
    }
    console.log(`  Created user: ${config.email}`);
  } else {
    // Ensure existing user is super user with correct workOSUserId
    const userModel = await UserModel.findOne({ where: { sId: user.sId } });
    if (userModel) {
      const updates: { isDustSuperUser?: boolean; workOSUserId?: string } = {};
      if (!userModel.isDustSuperUser) {
        updates.isDustSuperUser = true;
      }
      if (config.workOSUserId && userModel.workOSUserId !== config.workOSUserId) {
        updates.workOSUserId = config.workOSUserId;
      }
      if (Object.keys(updates).length > 0) {
        await userModel.update(updates);
        console.log(`  Updated user: ${config.email}`);
      }
    }
  }

  // Create workspace with subscription
  const workspace = await createWorkspaceInternal({
    name: config.workspaceName,
    isBusiness: false,
    planCode: FREE_UPGRADED_PLAN_CODE,
    endDate: null,
  });
  console.log(`  Created workspace: ${workspace.name}`);

  // Create admin membership
  await createAndLogMembership({
    user,
    workspace,
    role: "admin",
    origin: "invited",
  });
  console.log(`  Created membership`);
  console.log("Done!");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
