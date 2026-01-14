import * as fs from "fs";
import * as path from "path";

import { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types";

import { seedAgent } from "./seedAgent";
import { seedConversations } from "./seedConversations";
import { seedMCPTools } from "./seedMCPTools";
import { seedSkill } from "./seedSkill";
import { seedSpace } from "./seedSpace";
import type { Assets, SeedContext } from "./types";

// The workspace sId created by dust-hive seed
const WORKSPACE_SID = "DevWkSpace";

// Load assets from JSON files
function loadAssets(): Assets {
  const assetsDir = path.join(__dirname, "assets");
  const agent = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "agent.json"), "utf-8")
  );
  const skill = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "skill.json"), "utf-8")
  );
  const conversations = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "conversations.json"), "utf-8")
  );
  return { agent, skill, conversations };
}

interface SeedConfig {
  featureFlags: WhitelistableFeature[];
}

// Load config from JSON file if it exists
function loadConfig(): SeedConfig {
  const configPath = path.join(__dirname, "config.json");
  if (!fs.existsSync(configPath)) {
    return { featureFlags: [] };
  }

  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

makeScript({}, async ({ execute }, logger) => {
  const {
    agent: agentAsset,
    skill: skillAsset,
    conversations: conversationsAsset,
  } = loadAssets();

  logger.info("Loading workspace...");
  const workspace = await WorkspaceResource.fetchById(WORKSPACE_SID);
  if (!workspace) {
    throw new Error(
      `Workspace ${WORKSPACE_SID} not found. Make sure dust-hive seed has run first.`
    );
  }

  // Get the first admin user from the workspace
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace: renderLightWorkspaceType({ workspace }),
    roles: ["admin"],
  });
  if (memberships.length === 0) {
    throw new Error(
      `No admin user found in workspace ${WORKSPACE_SID}. Make sure dust-hive seed has run first.`
    );
  }
  const membershipUser = memberships[0].user;
  if (!membershipUser) {
    throw new Error("Membership has no associated user");
  }

  // Fetch the full UserResource
  const user = await UserResource.fetchById(membershipUser.sId);
  if (!user) {
    throw new Error("User not found");
  }

  // Create authenticator with the user
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    WORKSPACE_SID
  );

  // Create seed context
  const ctx: SeedContext = {
    auth,
    workspace,
    user,
    execute,
    logger,
  };

  // Load config and apply feature flags
  const config = loadConfig();
  if (config.featureFlags.length > 0) {
    logger.info({ flags: config.featureFlags }, "Feature flags to enable");
    if (execute) {
      await FeatureFlagResource.enableMany(workspace, config.featureFlags);
      logger.info("Feature flags enabled");
    }
  }

  await seedSkill(ctx, skillAsset);
  const customAgentSId = await seedAgent(ctx, agentAsset);
  await seedConversations(ctx, conversationsAsset, customAgentSId);
  const restrictedSpace = await seedSpace(ctx);
  await seedMCPTools(ctx, restrictedSpace);

  logger.info("Basics seed completed");
});
