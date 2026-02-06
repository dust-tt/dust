import * as fs from "fs";
import * as path from "path";

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
  FeedbackAsset,
  SeedContext,
  SuggestionAsset,
  TemplateAsset,
  UserAsset,
} from "@app/scripts/seed/factories";
import {
  seedAgents,
  seedAgentSuggestions,
  seedAnalytics,
  seedConversations,
  seedFeedbacks,
  seedTemplates,
  seedUsers,
} from "@app/scripts/seed/factories";

// The workspace sId created by dust-hive seed
const WORKSPACE_SID = "DevWkSpace";

interface Assets {
  agents: AgentAsset[];
  users: UserAsset[];
  conversations: ConversationAsset[];
  feedbacks: FeedbackAsset[];
  suggestions: SuggestionAsset[];
  templates: TemplateAsset[];
}

// Load assets from JSON files
function loadAssets(): Assets {
  const assetsDir = path.join(__dirname, "assets");
  const agents = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "agents.json"), "utf-8")
  );
  const users = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "users.json"), "utf-8")
  );
  const conversations = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "conversations.json"), "utf-8")
  );
  const feedbacks = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "feedbacks.json"), "utf-8")
  );
  const suggestions = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "suggestions.json"), "utf-8")
  );
  const templates = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "templates.json"), "utf-8")
  );
  return { agents, users, conversations, feedbacks, suggestions, templates };
}

makeScript({}, async ({ execute }, logger) => {
  const { agents, users, conversations, feedbacks, suggestions, templates } =
    loadAssets();

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

  // Enable the agent_builder_copilot feature flag
  logger.info("Enabling agent_builder_copilot feature flag...");
  if (execute) {
    await FeatureFlagResource.enableMany(workspace, ["agent_builder_copilot"]);
    logger.info("Feature flag enabled");
  }

  // 1. Create additional users (John Doe and Amigo)
  logger.info("Seeding users...");
  const additionalUsers = await seedUsers(ctx, users);

  // 2. Create agents (TechNewsDigest, SharedDocumentationWriter, MeteoWithSuggestions)
  // SharedDocumentationWriter will have all users as editors
  logger.info("Seeding agents...");
  const createdAgents = await seedAgents(ctx, agents, {
    additionalEditors: [...additionalUsers.values()],
  });

  // 3. Create agent suggestions for MeteoWithSuggestions
  logger.info("Seeding agent suggestions...");
  await seedAgentSuggestions(ctx, suggestions, { agents: createdAgents });

  // 4. Create conversations with TechNewsDigest and MeteoWithSuggestions
  logger.info("Seeding conversations...");
  const techNewsAgent = createdAgents.get("TechNewsDigest");
  const meteoAgent = createdAgents.get("MeteoWithSuggestions");
  await seedConversations(ctx, conversations, {
    agents: createdAgents,
    placeholders: {
      __TECH_NEWS_AGENT_SID__: techNewsAgent?.sId ?? "",
      __METEO_AGENT_SID__: meteoAgent?.sId ?? "",
    },
    additionalUsers,
  });

  // 5. Create feedbacks on conversations
  logger.info("Seeding feedbacks...");
  await seedFeedbacks(ctx, feedbacks);

  // 6. Index analytics to Elasticsearch (enables feedbacks to appear in insights)
  logger.info("Indexing analytics to Elasticsearch...");
  const conversationSIds = conversations.map((c) => c.sId);
  await seedAnalytics(ctx, conversationSIds);

  // 7. Create templates (with copilotInstructions)
  logger.info("Seeding templates...");
  await seedTemplates(ctx, templates);

  logger.info("Copilot seed completed");
});
