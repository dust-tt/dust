/**
 * Seeds a development database with a user, workspace, and subscription.
 *
 * Usage:
 *   npx tsx admin/seed_dev_user.ts <config.json>
 *
 * The config.json file should contain:
 *   {
 *     "email": "you@example.com",
 *     "name": "Your Name",
 *     "firstName": "Your",
 *     "workspaceName": "My Dev Workspace",
 *     // Optional fields:
 *     "sId": "user-sid",           // Auto-generated if not provided
 *     "username": "yourname",       // Derived from email if not provided
 *     "lastName": "Name",
 *     "workOSUserId": "workos-id",  // For SSO login support
 *     "provider": "google",
 *     "providerId": "google-id",
 *     "imageUrl": "https://..."
 *   }
 *
 * SAFETY: Only runs when NODE_ENV=development.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { createAndLogMembership } from "@app/lib/api/signup";
import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { FREE_UPGRADED_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import type { UserProviderType } from "@app/types";

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

/**
 * Seeds the database with a user, workspace, and membership.
 * Exported for programmatic use and testing.
 */
export async function seedDevUser(config: SeedUserConfig): Promise<{
  user: UserResource;
  workspaceSId: string;
}> {
  // Apply defaults for optional fields
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
      provider: (config.provider as UserProviderType) ?? null,
      providerId: config.providerId ?? null,
      imageUrl: config.imageUrl ?? null,
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
      if (
        config.workOSUserId &&
        userModel.workOSUserId !== config.workOSUserId
      ) {
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

  return { user, workspaceSId: workspace.sId };
}

// CLI entry point
async function main() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      `This script can only run in development. Current NODE_ENV: ${process.env.NODE_ENV}`
    );
  }

  const configPath = process.argv[2];
  if (!configPath) {
    console.error("Usage: npx tsx admin/seed_dev_user.ts <config.json>");
    console.error("");
    console.error("Config file format:");
    console.error(
      '  { "email": "...", "name": "...", "firstName": "...", "workspaceName": "..." }'
    );
    process.exit(1);
  }

  console.log("Seeding dev database...");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configContent = fs.readFileSync(configPath, "utf-8");
  const config: unknown = JSON.parse(configContent);

  if (!validateSeedConfig(config)) {
    throw new Error(
      "Config must include: email, name, firstName, workspaceName"
    );
  }

  await seedDevUser(config);
  console.log("Done!");
}

// Only run main() when this file is executed directly (not when imported)
const isMainModule =
  typeof import.meta.url === "string" &&
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  main().catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
}
