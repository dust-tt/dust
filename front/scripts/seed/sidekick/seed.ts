import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { makeScript } from "@app/scripts/helpers";
import type {
  AgentAsset,
  ConversationAsset,
  DataSourceAsset,
  FeedbackAsset,
  SuggestionAsset,
  TemplateAsset,
  UserAsset,
} from "@app/scripts/seed/factories";
import {
  createSeedContext,
  seedAgentSuggestions,
  seedAgents,
  seedAnalytics,
  seedConversations,
  seedDataSources,
  seedFeedbacks,
  seedTemplates,
  seedUsers,
} from "@app/scripts/seed/factories";
import * as fs from "fs";
import * as path from "path";

interface Assets {
  agents: AgentAsset[];
  users: UserAsset[];
  conversations: ConversationAsset[];
  dataSources: DataSourceAsset[];
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
  const dataSources = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "data_sources.json"), "utf-8")
  );
  const suggestions = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "suggestions.json"), "utf-8")
  );
  const templates = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "templates.json"), "utf-8")
  );
  return {
    agents,
    users,
    conversations,
    dataSources,
    feedbacks,
    suggestions,
    templates,
  };
}

makeScript({}, async ({ execute }, logger) => {
  const {
    agents,
    users,
    conversations,
    dataSources,
    feedbacks,
    suggestions,
    templates,
  } = loadAssets();

  const ctx = await createSeedContext({ execute, logger });

  // Enable the agent_builder_copilot feature flag
  logger.info("Enabling agent_builder_copilot feature flag...");
  if (execute) {
    await FeatureFlagResource.enableMany(ctx.workspace, ["agent_builder_copilot"]);
    logger.info("Feature flag enabled");
  }

  // 1. Create data sources with documents (for search_knowledge testing)
  logger.info("Seeding data sources...");
  await seedDataSources(ctx, dataSources);

  // 2. Create additional users (John Doe and Amigo)
  logger.info("Seeding users...");
  const additionalUsers = await seedUsers(ctx, users);

  // 3. Create agents (TechNewsDigest, SharedDocumentationWriter, MeteoWithSuggestions)
  // SharedDocumentationWriter will have all users as editors
  logger.info("Seeding agents...");
  const createdAgents = await seedAgents(ctx, agents, {
    additionalEditors: [...additionalUsers.values()],
  });

  // 4. Create agent suggestions for MeteoWithSuggestions
  logger.info("Seeding agent suggestions...");
  await seedAgentSuggestions(ctx, suggestions, { agents: createdAgents });

  // 5. Create conversations with TechNewsDigest and MeteoWithSuggestions
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

  // 6. Create feedbacks on conversations
  logger.info("Seeding feedbacks...");
  await seedFeedbacks(ctx, feedbacks);

  // 7. Index analytics to Elasticsearch (enables feedbacks to appear in insights)
  logger.info("Indexing analytics to Elasticsearch...");
  const conversationSIds = conversations.map((c) => c.sId);
  await seedAnalytics(ctx, conversationSIds);

  // 8. Create templates (with sidekickInstructions)
  logger.info("Seeding templates...");
  await seedTemplates(ctx, templates);

  logger.info("Sidekick seed completed");
});
