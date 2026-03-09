import { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import type {
  AgentAsset,
  ConversationAsset,
  SeedContext,
  SkillAsset,
  SuggestedSkillAsset,
} from "@app/scripts/seed/factories";
import {
  seedAgents,
  seedConversations,
  seedMCPTools,
  seedSkill,
  seedSpace,
  seedSuggestedSkills,
} from "@app/scripts/seed/factories";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import * as fs from "fs";
import * as path from "path";

// The workspace sId created by dust-hive seed
const WORKSPACE_SID = "DevWkSpace";

export interface Assets {
  agent: AgentAsset[];
  skill: SkillAsset;
  conversations: ConversationAsset[];
  suggestedSkills: SuggestedSkillAsset[];
}

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
  const suggestedSkills = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "suggested-skills.json"), "utf-8")
  );
  return { agent, skill, conversations, suggestedSkills };
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
    suggestedSkills: suggestedSkillsAsset,
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
    workspace: renderLightWorkspaceType({ workspace }),
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

  const createdSkill = await seedSkill(ctx, skillAsset);
  await seedSuggestedSkills(ctx, suggestedSkillsAsset);
  const skillsToLink = createdSkill ? [createdSkill] : [];
  const createdAgents = await seedAgents(ctx, agentAsset, {
    skills: skillsToLink,
  });

  // Add Dust global agent for conversations
  createdAgents.set("Dust", { sId: GLOBAL_AGENTS_SID.DUST, name: "Dust" });

  await seedConversations(ctx, conversationsAsset, {
    agents: createdAgents,
    placeholders: {
      __CUSTOM_AGENT_SID__: createdAgents.values().next().value?.sId ?? "",
    },
  });

  const restrictedSpace = await seedSpace(ctx);
  await seedMCPTools(ctx, restrictedSpace);

  logger.info("Basics seed completed");
});
