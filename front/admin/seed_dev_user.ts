/**
 * Seeds a development database with a user, workspace, and subscription.
 *
 * This script is called by dust-hive during the `warm` command to set up a
 * ready-to-use development environment. It reads user configuration from a
 * JSON file (typically ~/.dust-hive/seed-user.json) and creates:
 *
 * 1. A user with the correct workOSUserId (so Google OAuth login works)
 * 2. A workspace with FREE_UPGRADED_PLAN subscription
 * 3. An admin membership linking the user to the workspace
 * 4. Sets isDustSuperUser = true for Poke access
 *
 * SAFETY: This script will only run in development environment (NODE_ENV=development).
 */

import { createAndLogMembership } from "@app/lib/api/signup";
import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { FREE_UPGRADED_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { UserResource } from "@app/lib/resources/user_resource";

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

function assertDevelopmentEnvironment(): void {
  // Multiple safety checks to ensure we never run in production

  // Check 1: NODE_ENV must be development
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      `SAFETY ERROR: This script can only run in development environment. ` +
        `Current NODE_ENV: ${process.env.NODE_ENV}`
    );
  }

  // Check 2: Database URI should point to localhost or contain "dev"
  const dbUri = process.env.FRONT_DATABASE_URI || "";
  const isLocalDb =
    dbUri.includes("localhost") ||
    dbUri.includes("127.0.0.1") ||
    dbUri.includes("dev");

  if (!isLocalDb) {
    throw new Error(
      `SAFETY ERROR: Database URI does not appear to be a local/dev database. ` +
        `This script refuses to run against: ${dbUri.replace(/:[^:@]+@/, ":***@")}`
    );
  }

  // Check 3: Must not have production-like environment variables
  if (process.env.DUST_PROD === "true" || process.env.VERCEL_ENV === "production") {
    throw new Error(
      `SAFETY ERROR: Production environment variables detected. ` +
        `This script cannot run in production.`
    );
  }
}

async function main() {
  // Get config file path from command line
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("Usage: npx tsx admin/seed_dev_user.ts <config-file-path>");
    console.error("Example: npx tsx admin/seed_dev_user.ts ~/.dust-hive/seed-user.json");
    process.exit(1);
  }

  // Safety check - ensure we're in development
  assertDevelopmentEnvironment();

  console.log("=== Dust Dev User Seeding ===");
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Config file: ${configPath}`);
  console.log();

  // Read the config file
  const configFile = Bun.file(configPath);
  if (!(await configFile.exists())) {
    console.error(`Config file not found: ${configPath}`);
    console.error(
      "Run 'dust-hive seed-config <postgres-uri>' to create this file first."
    );
    process.exit(1);
  }

  const config: SeedUserConfig = await configFile.json();

  console.log(`Seeding user: ${config.email} (${config.name})`);
  console.log(`WorkOS ID: ${config.workOSUserId || "(none)"}`);
  console.log(`Workspace: ${config.workspaceName}`);
  console.log();

  // Check if user already exists (by workOSUserId or email)
  let user: UserResource | null = null;

  if (config.workOSUserId) {
    user = await UserResource.fetchByWorkOSUserId(config.workOSUserId);
    if (user) {
      console.log(`User already exists with workOSUserId: ${config.workOSUserId}`);
    }
  }

  if (!user) {
    user = await UserResource.fetchByEmail(config.email);
    if (user) {
      console.log(`User already exists with email: ${config.email}`);
    }
  }

  // Create user if doesn't exist
  if (!user) {
    console.log("Creating new user...");

    // Use UserModel.create directly to set isDustSuperUser
    const userModel = await UserModel.create({
      sId: config.sId,
      username: config.username,
      email: config.email.toLowerCase(),
      name: config.name,
      firstName: config.firstName,
      lastName: config.lastName,
      workOSUserId: config.workOSUserId,
      provider: config.provider as
        | "auth0"
        | "github"
        | "google"
        | "okta"
        | "samlp"
        | "waad"
        | null,
      providerId: config.providerId,
      imageUrl: config.imageUrl,
      isDustSuperUser: true,
    });

    user = await UserResource.fetchById(userModel.sId);
    if (!user) {
      throw new Error("Failed to fetch newly created user");
    }

    console.log(`  Created user: ${user.sId}`);
  } else {
    // Update existing user to be super user if not already
    const userModel = await UserModel.findOne({
      where: { sId: user.sId },
    });

    if (userModel && !userModel.isDustSuperUser) {
      await userModel.update({ isDustSuperUser: true });
      console.log(`  Updated user to be super user`);
    }

    // Update workOSUserId if needed
    if (config.workOSUserId && userModel && userModel.workOSUserId !== config.workOSUserId) {
      await userModel.update({ workOSUserId: config.workOSUserId });
      console.log(`  Updated workOSUserId`);
    }
  }

  // Create workspace
  console.log("Creating workspace with FREE_UPGRADED_PLAN...");
  const workspace = await createWorkspaceInternal({
    name: config.workspaceName,
    isBusiness: false,
    planCode: FREE_UPGRADED_PLAN_CODE,
    endDate: null,
  });
  console.log(`  Created workspace: ${workspace.sId} (${workspace.name})`);

  // Create membership
  console.log("Creating admin membership...");
  await createAndLogMembership({
    user,
    workspace,
    role: "admin",
    origin: "invited",
  });
  console.log(`  Created admin membership for ${user.email}`);

  console.log();
  console.log("=== Seeding Complete ===");
  console.log();
  console.log("You can now:");
  console.log("  1. Go to http://localhost:<port>");
  console.log("  2. Sign in with Google using your @dust.tt account");
  console.log("  3. You'll be logged in as a super admin with Poke access");
  console.log();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
