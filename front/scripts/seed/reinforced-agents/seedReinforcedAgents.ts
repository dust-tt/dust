import { MessageModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type {
  AgentAsset,
  ConversationAsset,
  DataSourceAsset,
  FeedbackAsset,
  SeedContext,
  SkillAsset,
  SkillSuggestionAsset,
  UserAsset,
} from "@app/scripts/seed/factories";
import {
  seedAgents,
  seedAnalytics,
  seedConversations,
  seedDataSources,
  seedFeedbacks,
  seedSkill,
  seedSkillSuggestions,
  seedUsers,
} from "@app/scripts/seed/factories";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import * as fs from "fs";
import * as path from "path";

const AGENT_NAME = "Internal_IT_Helpdesk_Bot_2";

const OTHER_USER: UserAsset = {
  sId: "otherUser",
  username: "jdoe",
  email: "jane.doe@dust.tt",
  firstName: "Jane",
  lastName: "Doe",
};

interface Assets {
  agents: AgentAsset[];
  conversations: ConversationAsset[];
  dataSources: DataSourceAsset[];
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
  const rawDataSources = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "data_sources.json"), "utf-8")
  );
  // Resolve file references: documents can use { file: "filename" } instead of inline content.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw JSON with optional file field
  const dataSources: DataSourceAsset[] = rawDataSources.map((ds: any) => ({
    ...ds,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    documents: ds.documents.map((doc: any) => ({
      ...doc,
      content: doc.file
        ? fs.readFileSync(path.join(assetsDir, doc.file), "utf-8")
        : doc.content,
    })),
  }));
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
    dataSources,
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
    dataSources,
    dustConversations,
    feedbacks,
    skills,
    skillSuggestions,
  } = loadAssets();

  // Seed data sources (e.g. books.xml for BookKeeper skill).
  // This requires a running Dust CoreAPI so it may fail in test environments.
  ctx.logger.info("Seeding data sources...");
  const placeholders: Record<string, string> = {};
  try {
    await seedDataSources(ctx, dataSources);

    // Look up created data source views to replace placeholders in skill instructions.
    if (ctx.execute) {
      for (const dsAsset of dataSources) {
        const ds = await DataSourceResource.fetchByNameOrId(
          ctx.auth,
          dsAsset.name
        );
        if (ds) {
          const views = await DataSourceViewResource.listForDataSources(
            ctx.auth,
            [ds]
          );
          if (views.length > 0) {
            const view = views[0];
            const prefix = `__${dsAsset.name.toUpperCase()}_`;
            placeholders[`${prefix}DSV_ID__`] = view.sId;
            placeholders[`${prefix}SPACE_ID__`] = view.space.sId;
          }
        }
      }
    }
  } catch (e) {
    ctx.logger.warn(
      { error: e },
      "Failed to seed data sources (CoreAPI unavailable?), skills will have unresolved placeholders"
    );
  }

  ctx.logger.info("Seeding skills...");
  const createdSkills = new Map<string, SkillResource>();
  for (const skillAsset of skills) {
    // Replace data source placeholders in instructions.
    const resolvedAsset = resolveSkillPlaceholders(skillAsset, placeholders);
    const created = await seedSkill(ctx, resolvedAsset);
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

  // Seed additional users for Dust conversations.
  ctx.logger.info("Seeding additional users...");
  const additionalUsers = await seedUsers(ctx, [OTHER_USER]);

  // Add Dust global agent and seed Dust conversations
  createdAgents.set("Dust", { sId: GLOBAL_AGENTS_SID.DUST, name: "Dust" });
  ctx.logger.info("Seeding Dust conversations...");
  await seedConversations(ctx, dustConversations, {
    agents: createdAgents,
    additionalUsers,
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
  const resolvedSkillSuggestions = skillSuggestions.map((s) =>
    resolveSkillSuggestionPlaceholders(s, placeholders)
  );
  await seedSkillSuggestions(ctx, resolvedSkillSuggestions, createdSkills);

  if (!skipAnalytics) {
    ctx.logger.info("Indexing analytics to Elasticsearch...");
    const allConversations = [...conversations, ...dustConversations];
    const conversationIds = allConversations.map((c) => c.sId);
    await seedAnalytics(ctx, conversationIds);
  }
}

function resolveSkillPlaceholders(
  skill: SkillAsset,
  placeholders: Record<string, string>
): SkillAsset {
  if (Object.keys(placeholders).length === 0) {
    return skill;
  }

  let { instructions, instructionsHtml } = skill;
  for (const [key, value] of Object.entries(placeholders)) {
    instructions = instructions.replaceAll(key, value);
    instructionsHtml = instructionsHtml.replaceAll(key, value);
  }

  return { ...skill, instructions, instructionsHtml };
}

function resolveSkillSuggestionPlaceholders(
  suggestion: SkillSuggestionAsset,
  placeholders: Record<string, string>
): SkillSuggestionAsset {
  if (Object.keys(placeholders).length === 0) {
    return suggestion;
  }

  const instructionEdits = suggestion.suggestion.instructionEdits?.map(
    (edit) => {
      let content = edit.content;
      for (const [key, value] of Object.entries(placeholders)) {
        content = content.replaceAll(key, value);
      }
      return { ...edit, content };
    }
  );

  return {
    ...suggestion,
    suggestion: { ...suggestion.suggestion, instructionEdits },
  };
}
