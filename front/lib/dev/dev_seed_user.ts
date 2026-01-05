/**
 * Core logic for seeding a development database with a user, workspace, and subscription.
 * This module is used by admin/seed_dev_user.ts CLI script.
 */

import { createAndLogMembership } from "@app/lib/api/signup";
import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { FREE_UPGRADED_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import type { LightWorkspaceType, UserProviderType } from "@app/types";
import { isDevelopment } from "@app/types";

const VALID_PROVIDERS = [
  "auth0",
  "github",
  "google",
  "okta",
  "samlp",
  "waad",
] as const;

function isValidProvider(value: unknown): value is UserProviderType {
  if (value === null || value === undefined) {
    return true;
  }
  return (
    typeof value === "string" &&
    VALID_PROVIDERS.includes(value as (typeof VALID_PROVIDERS)[number])
  );
}

export interface SeedUserConfig {
  // Required fields
  email: string;
  name: string;
  firstName: string;
  workspaceName: string;
  // Optional fields
  sId?: string;
  username?: string;
  lastName?: string | null;
  workOSUserId?: string | null;
  provider?: string | null;
  providerId?: string | null;
  imageUrl?: string | null;
}

export function validateSeedConfig(config: unknown): config is SeedUserConfig {
  if (typeof config !== "object" || config === null) {
    return false;
  }
  const c = config as Record<string, unknown>;
  return (
    typeof c.email === "string" &&
    typeof c.name === "string" &&
    typeof c.firstName === "string" &&
    typeof c.workspaceName === "string"
  );
}

export interface SeedDevUserResult {
  user: UserResource;
  workspaceSId: string;
}

/**
 * Creates or updates a user as a super user.
 * Exported separately for testing.
 */
export async function getOrCreateSuperUser(config: {
  email: string;
  name: string;
  firstName: string;
  sId?: string;
  username?: string;
  lastName?: string | null;
  workOSUserId?: string | null;
  provider?: string | null;
  providerId?: string | null;
  imageUrl?: string | null;
}): Promise<{ user: UserResource; created: boolean }> {
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
      provider: isValidProvider(config.provider) ? config.provider : null,
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

  await createAndLogMembership({
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
  await createAdminMembership(user, {
    id: workspace.id,
    sId: workspace.sId,
    name: workspace.name,
    role: "admin",
    segmentation: null,
    whiteListedProviders: null,
    defaultEmbeddingProvider: null,
    metadata: null,
  });
  console.log(`  Created membership`);

  return { user, workspaceSId: workspace.sId };
}
