import type {
  AgentAsset,
  ConversationAsset,
  FeedbackAsset,
  SeedContext,
} from "@app/scripts/seed/factories";
import {
  seedAgents,
  seedAnalytics,
  seedConversations,
  seedFeedbacks,
} from "@app/scripts/seed/factories";
import * as fs from "fs";
import * as path from "path";

const AGENT_NAME = "Internal_IT_Helpdesk_Bot_2";

interface Assets {
  agents: AgentAsset[];
  conversations: ConversationAsset[];
  feedbacks: FeedbackAsset[];
}

// Load assets from JSON files
function loadAssets(): Assets {
  const assetsDir = path.join(__dirname, "assets");
  const agents = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "agents.json"), "utf-8")
  );
  const conversations = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "conversations.json"), "utf-8")
  );
  const feedbacks = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "feedbacks.json"), "utf-8")
  );
  return { agents, conversations, feedbacks };
}

export async function seedReinforcedAgents(
  ctx: SeedContext,
  { skipAnalytics }: { skipAnalytics?: boolean } = {}
): Promise<void> {
  const { agents, conversations, feedbacks } = loadAssets();

  ctx.logger.info("Seeding agents...");
  const createdAgents = await seedAgents(ctx, agents);

  ctx.logger.info("Seeding conversations...");
  const itHelpdeskAgent = createdAgents.get(AGENT_NAME);
  await seedConversations(ctx, conversations, {
    agents: createdAgents,
    placeholders: {
      __IT_HELPDESK_SID__: itHelpdeskAgent?.sId ?? "",
    },
  });

  ctx.logger.info("Seeding feedbacks...");
  await seedFeedbacks(ctx, feedbacks);

  if (!skipAnalytics) {
    ctx.logger.info("Indexing analytics to Elasticsearch...");
    const conversationIds = conversations.map((c) => c.sId);
    await seedAnalytics(ctx, conversationIds);
  }
}
