/**
 * Core logic for seeding a development database with a user, workspace, and subscription.
 * This module is used by admin/seed_dev_user.ts CLI script.
 */

import { z } from "zod";

import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { FREE_UPGRADED_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { invalidateActiveSeatsCache } from "@app/lib/plans/usage/seats";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { LightWorkspaceType } from "@app/types";
import { isDevelopment } from "@app/types";

const UserProviderSchema = z
  .enum(["auth0", "github", "google", "okta", "samlp", "waad"])
  .nullable()
  .optional();

const SeedUserConfigSchema = z.object({
  // Required fields
  email: z.string().email(),
  name: z.string().min(1),
  firstName: z.string().min(1),
  workspaceName: z.string().min(1),
  // Optional fields
  sId: z.string().optional(),
  username: z.string().optional(),
  lastName: z.string().nullable().optional(),
  workOSUserId: z.string().nullable().optional(),
  provider: UserProviderSchema,
  providerId: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
});

export type SeedUserConfig = z.infer<typeof SeedUserConfigSchema>;

export function parseSeedConfig(config: unknown): SeedUserConfig {
  return SeedUserConfigSchema.parse(config);
}

export interface SeedDevUserResult {
  user: UserResource;
  workspaceSId: string;
}

/**
 * Creates or updates a user as a super user.
 * Exported separately for testing.
 */
export async function getOrCreateSuperUser(
  config: Omit<SeedUserConfig, "workspaceName">
): Promise<{ user: UserResource; created: boolean }> {
  const sId = config.sId ?? generateRandomModelSId();
  const username = config.username ?? config.email.split("@")[0];

  // Check if user already exists
  let user: UserResource | null = null;
  if (config.workOSUserId) {
    user = await UserResource.fetchByWorkOSUserId(config.workOSUserId);
  }
  user ??= await UserResource.fetchByEmail(config.email);

  if (!user) {
    // Create new user with isDustSuperUser = true
    const userModel = await UserModel.create({
      sId,
      username,
      email: config.email.toLowerCase(),
      name: config.name,
      firstName: config.firstName,
      lastName: config.lastName ?? null,
      workOSUserId: config.workOSUserId ?? null,
      provider: config.provider ?? null,
      providerId: config.providerId ?? null,
      imageUrl: config.imageUrl ?? null,
      isDustSuperUser: true,
    });

    const newUser = await UserResource.fetchById(userModel.sId);
    if (!newUser) {
      throw new Error("Failed to fetch newly created user");
    }
    return { user: newUser, created: true };
  }

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
      // Re-fetch to get updated values
      const updatedUser = await UserResource.fetchById(user.sId);
      if (updatedUser) {
        return { user: updatedUser, created: false };
      }
    }
  }

  return { user, created: false };
}

/**
 * Creates an admin membership between a user and workspace.
 * Exported separately for testing.
 */
export async function createAdminMembership(
  user: UserResource,
  workspace: LightWorkspaceType
): Promise<void> {
  // Check if membership already exists
  const existingMembership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });

  if (existingMembership) {
    return;
  }

  // Use MembershipResource directly to avoid tracking side effects
  // that can cause stale seat count caching
  await MembershipResource.createMembership({
    user,
    workspace,
    role: "admin",
    origin: "invited",
  });
}

/**
 * Seeds the database with a user, workspace, and membership.
 * Only runs in development mode.
 */
export async function seedDevUser(
  config: SeedUserConfig
): Promise<SeedDevUserResult> {
  if (!isDevelopment()) {
    throw new Error("seedDevUser can only be called in development mode");
  }

  const { user, created } = await getOrCreateSuperUser(config);

  if (created) {
    console.log(`  Created user: ${config.email}`);
  } else {
    console.log(`  Updated user: ${config.email}`);
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
  const lightWorkspace = renderLightWorkspaceType({ workspace });
  await createAdminMembership(user, lightWorkspace);
  console.log(`  Created membership`);

  // Invalidate seats cache to ensure fresh count after membership creation
  await invalidateActiveSeatsCache(workspace.sId);
  console.log(`  Invalidated seats cache`);

  return { user, workspaceSId: workspace.sId };
}
