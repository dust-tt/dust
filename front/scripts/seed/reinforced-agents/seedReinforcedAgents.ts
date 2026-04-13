import { MessageModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type {
  AgentAsset,
  ConversationAsset,
  FeedbackAsset,
  SeedContext,
  SkillAsset,
  SkillSuggestionAsset,
} from "@app/scripts/seed/factories";
import {
  seedAgents,
  seedAnalytics,
  seedConversations,
  seedFeedbacks,
  seedSkill,
  seedSkillSuggestions,
} from "@app/scripts/seed/factories";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import * as fs from "fs";
import * as path from "path";

const AGENT_NAME = "Internal_IT_Helpdesk_Bot_2";

interface Assets {
  agents: AgentAsset[];
  conversations: ConversationAsset[];
  dustConversations: ConversationAsset[];
  feedbacks: FeedbackAsset[];
  skills: SkillAsset[];
  skillSuggestions: SkillSuggestionAsset[];
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
  const dustConversations = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "dust-conversations.json"), "utf-8")
  );
  const feedbacks = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "feedbacks.json"), "utf-8")
  );
  const skills: SkillAsset[] = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "skills.json"), "utf-8")
  );
  const skillSuggestions: SkillSuggestionAsset[] = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "skill_suggestions.json"), "utf-8")
  );
  return {
    agents,
    conversations,
    dustConversations,
    feedbacks,
    skills,
    skillSuggestions,
  };
}

export async function seedReinforcement(
  ctx: SeedContext,
  { skipAnalytics }: { skipAnalytics?: boolean } = {}
): Promise<void> {
  const {
    agents,
    conversations,
    dustConversations,
    feedbacks,
    skills,
    skillSuggestions,
  } = loadAssets();

  ctx.logger.info("Seeding skills...");
  const createdSkills = new Map<string, SkillResource>();
  for (const skillAsset of skills) {
    const created = await seedSkill(ctx, skillAsset);
    if (created) {
      createdSkills.set(skillAsset.name, created);
    }
  }
  const skillsToLink = Array.from(createdSkills.values());

  const poemAnalyserSkill = skillsToLink[0] ?? null;

  ctx.logger.info("Seeding agents...");
  const createdAgents = await seedAgents(ctx, agents, {
    skills: skillsToLink,
  });

  ctx.logger.info("Seeding conversations...");
  const itHelpdeskAgent = createdAgents.get(AGENT_NAME);
  await seedConversations(ctx, conversations, {
    agents: createdAgents,
    placeholders: {
      __IT_HELPDESK_SID__: itHelpdeskAgent?.sId ?? "",
    },
  });

  // Add Dust global agent and seed Dust conversations
  createdAgents.set("Dust", { sId: GLOBAL_AGENTS_SID.DUST, name: "Dust" });
  ctx.logger.info("Seeding Dust conversations...");
  await seedConversations(ctx, dustConversations, {
    agents: createdAgents,
  });

  // Activate the Poem Analyser skill as JIT skill in Dust conversations
  if (ctx.execute && poemAnalyserSkill) {
    ctx.logger.info("Activating JIT skills in Dust conversations...");
    for (const conv of dustConversations) {
      const conversation = await ConversationResource.fetchById(
        ctx.auth,
        conv.sId,
        { dangerouslySkipPermissionFiltering: true }
      );
      if (!conversation) {
        continue;
      }

      // Activate the skill in the conversation
      await poemAnalyserSkill.upsertToConversation(ctx.auth, {
        conversationId: conversation.id,
        enabled: true,
      });

      // Snapshot skills for each agent message using the resource
      for (const exchange of conv.exchanges) {
        const messageRow = await MessageModel.findOne({
          where: { sId: exchange.agent.sId, workspaceId: ctx.workspace.id },
        });
        if (messageRow?.agentMessageId) {
          await SkillResource.snapshotConversationSkillsForMessage(ctx.auth, {
            agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
            agentMessageId: messageRow.agentMessageId,
            conversationId: conversation.id,
          });
        }
      }
    }
  }

  ctx.logger.info("Seeding feedbacks...");
  await seedFeedbacks(ctx, feedbacks);

  ctx.logger.info("Seeding skill suggestions...");
  await seedSkillSuggestions(ctx, skillSuggestions, createdSkills);

  if (!skipAnalytics) {
    ctx.logger.info("Indexing analytics to Elasticsearch...");
    const allConversations = [...conversations, ...dustConversations];
    const conversationIds = allConversations.map((c) => c.sId);
    await seedAnalytics(ctx, conversationIds);
  }
}
