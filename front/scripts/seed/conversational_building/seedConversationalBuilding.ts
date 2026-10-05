import { pruneSupersededSkillSuggestions } from "@app/lib/api/actions/servers/building_agents_and_skills/skill_suggestion_changes";
import { fetchRunAgentTool } from "@app/lib/api/assistant/suggestable_sub_agents";
import { SkillSuggestionModel } from "@app/lib/models/skill/skill_suggestion";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  ConversationAsset,
  CreatedAgent,
  DataSourceAsset,
  RemoteMCPToolAsset,
  SeedContext,
  SkillAsset,
  SkillSuggestionAsset,
  SuggestionBatchAsset,
  UserAsset,
} from "@app/scripts/seed/factories";
import {
  seedAgent,
  seedConversations,
  seedDataSources,
  seedRemoteMCPTool,
  seedSkill,
  seedUsers,
} from "@app/scripts/seed/factories";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import * as fs from "fs";
import * as path from "path";

export const SKILL_NAME = "MeetingNotesFormatter";
export const STANDUP_DIGEST_SKILL_NAME = "StandupDigest";
export const LUKE_USER_SID = "SeedUserLuke";
export const CONVERSATION_SID = "ConvBuildingConv01";
export const BATCH_CONVERSATION_SID = "ConvBuildingConv02";
export const REFERENCES_CONVERSATION_SID = "ConvBuildingConv03";
const ACTION_ITEM_TRACKER_SKILL_PLACEHOLDER =
  "__ACTION_ITEM_TRACKER_SKILL_SID__";
const TEAM_CALENDAR_TOOL_PLACEHOLDER = "__TEAM_CALENDAR_TOOL_ID__";
const GLOSSARY_DSV_PLACEHOLDER = "__MEETING_NOTES_ARCHIVE_DSV_ID__";
const GLOSSARY_SPACE_PLACEHOLDER = "__MEETING_NOTES_ARCHIVE_SPACE_ID__";

interface Assets {
  users: UserAsset[];
  skills: SkillAsset[];
  skillSuggestions: SkillSuggestionAsset[];
  suggestionBatches: SuggestionBatchAsset[];
  batchSkillSuggestions: SkillSuggestionAsset[];
  conversations: ConversationAsset[];
  dataSources: DataSourceAsset[];
  mcpTools: RemoteMCPToolAsset[];
}

export function loadAssets(): Assets {
  const assetsDir = path.join(__dirname, "assets");
  const read = (file: string) =>
    JSON.parse(fs.readFileSync(path.join(assetsDir, file), "utf-8"));
  return {
    users: read("users.json"),
    skills: read("skills.json"),
    skillSuggestions: read("skill_suggestions.json"),
    suggestionBatches: read("suggestion_batches.json"),
    batchSkillSuggestions: read("batch_skill_suggestions.json"),
    conversations: read("conversations.json"),
    dataSources: read("data_sources.json"),
    mcpTools: read("mcp_tools.json"),
  };
}

export interface SeedConversationalBuildingResult {
  users: Map<string, UserResource>;
  skills: Map<string, SkillResource>;
  skillSuggestions: Map<string, SkillSuggestionResource>;
  suggestionBatches: Map<string, BatchSuggestionResource>;
  batchSkillSuggestions: Map<string, SkillSuggestionResource>;
  // The pending placeholder skills of the skill creations, keyed by the asset `skillName`.
  pendingSkills: Map<string, SkillResource>;
  // The sIds the conversations got on this run, keyed by the asset `sId`.
  conversationSIds: Map<string, string>;
  // The Team Calendar tool referenced by the tool edit suggestion. Null on dry runs.
  toolView: MCPServerViewResource | null;
  // The Meeting Notes Archive view referenced by the knowledge edit suggestion. Null on dry runs
  // and when the data source could not be created (no CoreAPI).
  knowledgeView: DataSourceViewResource | null;
}

export async function seedConversationalBuilding(
  ctx: SeedContext
): Promise<SeedConversationalBuildingResult> {
  const { logger } = ctx;
  const {
    users,
    skills,
    skillSuggestions,
    suggestionBatches,
    batchSkillSuggestions,
    conversations,
    dataSources,
    mcpTools,
  } = loadAssets();

  // 1. Additional users (Luke and Leila).
  logger.info("Seeding users...");
  const createdUsers = await seedUsers(ctx, users);

  // 2. The skills, owned by the main user with Luke as editor so the editors suggestion
  // (add Leila, remove Luke) is meaningful.
  logger.info("Seeding skills...");
  const createdSkills = new Map<string, SkillResource>();
  const luke = createdUsers.get(LUKE_USER_SID);
  for (const skillAsset of skills) {
    const skill = await seedSkill(ctx, skillAsset, {
      editors: luke ? [luke] : [],
    });
    if (skill) {
      createdSkills.set(skillAsset.name, skill);
    }
  }

  // 3. The tool and the knowledge referenced by the tool and knowledge edit suggestions.
  logger.info("Seeding MCP tools...");
  const toolView = await seedRemoteMCPTool(ctx, mcpTools[0]);

  logger.info("Seeding data sources...");
  const knowledgeView = await seedGlossaryDataSource(ctx, dataSources);

  const suggestionPlaceholders: Record<string, string> = {
    [TEAM_CALENDAR_TOOL_PLACEHOLDER]: toolView?.sId ?? "",
    [GLOSSARY_DSV_PLACEHOLDER]: knowledgeView?.sId ?? "",
    [GLOSSARY_SPACE_PLACEHOLDER]: knowledgeView?.space.sId ?? "",
  };

  // 4. Conversational suggestions on the skill.
  logger.info("Seeding skill suggestions...");
  const createdSkillSuggestions = await seedPrunedSkillSuggestions(
    ctx,
    skillSuggestions.map((s) =>
      resolveSkillSuggestionPlaceholders(s, suggestionPlaceholders)
    ),
    createdSkills,
    new Map()
  );

  // 5. Suggestion batches, with a pending placeholder skill for each skill creation.
  logger.info("Seeding suggestion batches...");
  const pendingSkills = await seedPendingSkills(ctx, batchSkillSuggestions);
  const createdBatches = new Map<string, BatchSuggestionResource>();
  if (ctx.execute) {
    for (const { id, title, analysis } of suggestionBatches) {
      createdBatches.set(
        id,
        await BatchSuggestionResource.makeNew(ctx.auth, {
          title,
          analysis,
          sourceConversation: null,
        })
      );
    }
  }
  const actionItemTrackerSkillSId =
    pendingSkills.get("ActionItemTracker")?.sId ?? "";
  const createdBatchSkillSuggestions = await seedPrunedSkillSuggestions(
    ctx,
    batchSkillSuggestions.map((s) =>
      resolveSkillSuggestionPlaceholders(s, {
        [ACTION_ITEM_TRACKER_SKILL_PLACEHOLDER]: actionItemTrackerSkillSId,
      })
    ),
    new Map([...createdSkills, ...pendingSkills]),
    createdBatches
  );

  logger.info("Seeding the references batch...");
  const references = await seedReferencesBatch(ctx);

  logger.info("Seeding the created sub-agents batch...");
  const createdSubAgentsBatch = references
    ? await seedCreatedSubAgentsBatch(ctx, references.teamAssistant)
    : null;

  // 6. The Dust conversations embedding the suggestions as `:skill_suggestion[]` and
  // `:batch_edit[]` directives.
  logger.info("Seeding conversations...");
  const agents = new Map<string, CreatedAgent>([
    ["Dust", { sId: GLOBAL_AGENTS_SID.DUST, name: "Dust" }],
  ]);
  const suggestionSId = (id: string) =>
    createdSkillSuggestions.get(id)?.sId ?? "";
  // Each run creates new conversations, so the ones of previous runs keep their outdated cards.
  const runSuffix = Date.now().toString(36);
  const conversationSIds = new Map(
    conversations.map((c) => [c.sId, `${c.sId}${runSuffix}`])
  );
  await seedConversations(
    ctx,
    conversations.map((c) => ({
      ...c,
      sId: `${c.sId}${runSuffix}`,
      exchanges: c.exchanges.map(({ user, agent }) => ({
        user: { ...user, sId: `${user.sId}${runSuffix}` },
        agent: { ...agent, sId: `${agent.sId}${runSuffix}` },
      })),
    })),
    {
      agents,
      placeholders: {
        __MEETING_NOTES_SKILL_SID__: createdSkills.get(SKILL_NAME)?.sId ?? "",
        __STANDUP_DIGEST_SKILL_SID__:
          createdSkills.get(STANDUP_DIGEST_SKILL_NAME)?.sId ?? "",
        __SKILL_AVAILABILITY_SUGGESTION_SID__:
          createdSkillSuggestions.get("skillAvailability")?.sId ?? "",
        __SKILL_EDIT_INSTRUCTIONS_SUGGESTION_SID__: suggestionSId(
          "skillEditInstructions"
        ),
        __SKILL_EDIT_DESCRIPTION_SUGGESTION_SID__: suggestionSId(
          "skillEditDescription"
        ),
        __SKILL_EDITORS_SUGGESTION_SID__: suggestionSId("skillEditors"),
        __SKILL_EDIT_TOOL_SUGGESTION_SID__: suggestionSId("skillEditTool"),
        __SKILL_EDIT_KNOWLEDGE_SUGGESTION_SID__:
          suggestionSId("skillEditKnowledge"),
        __SKILL_USER_FACING_DESCRIPTION_SUGGESTION_SID__: suggestionSId(
          "skillUserFacingDescription"
        ),
        __SKILL_NAME_SUGGESTION_SID__: suggestionSId("skillName"),
        __SKILL_DELETE_SUGGESTION_SID__: suggestionSId("skillDelete"),
        [ACTION_ITEM_TRACKER_SKILL_PLACEHOLDER]: actionItemTrackerSkillSId,
        __ACTION_ITEM_TRACKER_BATCH_SID__:
          createdBatches.get("actionItemTracker")?.sId ?? "",
        __GROUP_BY_OWNER_BATCH_SID__:
          createdBatches.get("groupByOwner")?.sId ?? "",
        __RENAME_TO_TEAM_DIGEST_BATCH_SID__:
          createdBatches.get("renameToTeamDigest")?.sId ?? "",
        __MEMBERS_ONLY_BATCH_SID__:
          createdBatches.get("membersOnly")?.sId ?? "",
        __TEAM_ASSISTANT_AGENT_SID__: references?.teamAssistant.sId ?? "",
        __DECISION_LOG_SKILL_SID__: references?.decisionLog.sId ?? "",
        __REFERENCES_BATCH_SID__: references?.batch.sId ?? "",
        __CREATED_SUB_AGENTS_BATCH_SID__: createdSubAgentsBatch?.sId ?? "",
      },
      additionalUsers: createdUsers,
    }
  );
  await linkSuggestionsToConversation(
    ctx,
    conversationSIds.get(CONVERSATION_SID),
    createdSkillSuggestions
  );
  await linkSuggestionsToConversation(
    ctx,
    conversationSIds.get(BATCH_CONVERSATION_SID),
    createdBatchSkillSuggestions
  );
  await linkSuggestionsToConversation(
    ctx,
    conversationSIds.get(REFERENCES_CONVERSATION_SID),
    references?.skillSuggestions ?? new Map()
  );
  logger.info(
    { conversationSIds: [...conversationSIds.values()] },
    "Conversations seeded"
  );

  return {
    users: createdUsers,
    skills: createdSkills,
    skillSuggestions: createdSkillSuggestions,
    suggestionBatches: createdBatches,
    batchSkillSuggestions: createdBatchSkillSuggestions,
    pendingSkills,
    conversationSIds,
    toolView,
    knowledgeView,
  };
}

// Records each suggestion and outdates the pending ones it supersedes, as recording it from a
// conversation does.
async function seedPrunedSkillSuggestions(
  ctx: SeedContext,
  suggestions: SkillSuggestionAsset[],
  skills: Map<string, SkillResource>,
  batches: Map<string, BatchSuggestionResource>
): Promise<Map<string, SkillSuggestionResource>> {
  const created = new Map<string, SkillSuggestionResource>();
  if (!ctx.execute) {
    return created;
  }

  for (const asset of suggestions) {
    const skill = skills.get(asset.skillName);
    if (!skill) {
      ctx.logger.warn(
        { skillName: asset.skillName },
        "Skill not found for suggestion, skipping"
      );
      continue;
    }

    const suggestion = await SkillSuggestionFactory.create(ctx.auth, skill, {
      kind: asset.kind,
      suggestion: asset.suggestion,
      analysis: asset.analysis,
      title: asset.title ?? null,
      state: asset.state,
      source: asset.source,
      batchModelId: asset.batch ? (batches.get(asset.batch)?.id ?? null) : null,
    });
    await pruneSupersededSkillSuggestions(ctx.auth, skill, suggestion);
    if (asset.id) {
      created.set(asset.id, suggestion);
    }
  }

  return created;
}

// The conversation cards only list the suggestions that cite their conversation as a source, and
// the conversation can only be created once the suggestions it embeds exist.
async function linkSuggestionsToConversation(
  ctx: SeedContext,
  conversationSId: string | undefined,
  suggestions: Map<string, SkillSuggestionResource>
): Promise<void> {
  if (!ctx.execute || !conversationSId || suggestions.size === 0) {
    return;
  }

  const conversation = await ConversationResource.fetchById(
    ctx.auth,
    conversationSId,
    { dangerouslySkipPermissionFiltering: true }
  );
  if (!conversation) {
    throw new Error(`Seeded conversation ${conversationSId} not found`);
  }

  await SkillSuggestionModel.update(
    { sourceConversationIds: [conversation.id] },
    {
      where: {
        workspaceId: ctx.workspace.id,
        id: [...suggestions.values()].map((s) => s.id),
      },
    }
  );
}

// A batch whose agent changes use the skill and the agent it creates, as `suggest` records refs:
// the new DecisionLog skill is added to TeamAssistant, and the new MeetingPrep agent is created
// with it and added as a sub-agent of TeamAssistant.
async function seedReferencesBatch(ctx: SeedContext): Promise<{
  batch: BatchSuggestionResource;
  teamAssistant: CreatedAgent;
  decisionLog: SkillResource;
  skillSuggestions: Map<string, SkillSuggestionResource>;
} | null> {
  const teamAssistant = await seedAgent(ctx, {
    name: "TeamAssistant",
    description: "Answers the team's day-to-day questions.",
    instructions: "Help the team with their day-to-day questions.",
    pictureUrl: "https://dust.tt/static/droidavatar/Droid_Indigo_1.jpg",
  });
  if (!ctx.execute || !teamAssistant) {
    return null;
  }

  const batch = await BatchSuggestionResource.makeNew(ctx.auth, {
    title: "Log meeting decisions",
    analysis:
      "Decisions get lost after meetings. A DecisionLog skill records them, TeamAssistant and a new MeetingPrep agent both use it.",
    sourceConversation: null,
  });

  const decisionLog = await SkillResource.createPending(ctx.auth);
  if (decisionLog.isErr()) {
    throw decisionLog.error;
  }

  const decisionLogCreation = await SkillSuggestionFactory.create(
    ctx.auth,
    decisionLog.value,
    {
      kind: "create",
      suggestion: {
        name: "DecisionLog",
        userFacingDescription:
          "Keep a log of the decisions made in your meetings, with who decided and why.",
        agentFacingDescription:
          "Records decisions from meeting notes or messages: what was decided, by whom and why.",
        instructions:
          '<div data-type="instructions-root" data-block-id="instructions-root"><p data-block-id="dl01intr">For each decision, record what was decided, who decided it and the reason, in one line.</p></div>',
      },
      analysis: null,
      title: "Create DecisionLog",
      state: "pending",
      source: "conversational",
      batchModelId: batch.id,
    }
  );

  await AgentSuggestionFactory.createSkills(ctx.auth, teamAssistant, {
    suggestion: { action: "add", skillId: decisionLog.value.sId },
    analysis: null,
    source: "conversational",
    batchModelId: batch.id,
  });

  const meetingPrep = await AgentResource.createPending(
    ctx.auth,
    "MeetingPrep"
  );
  if (meetingPrep.isErr()) {
    throw meetingPrep.error;
  }

  await AgentSuggestionFactory.createCreate(ctx.auth, meetingPrep.value, {
    suggestion: {
      name: "MeetingPrep",
      description: "Prepares meetings from the decisions already logged.",
      instructions:
        "<p>Before a meeting, list the open questions and the related decisions already logged.</p>",
      skillIds: [decisionLog.value.sId],
    },
    analysis: null,
    batchModelId: batch.id,
  });

  const runAgentTool = await fetchRunAgentTool(ctx.auth);
  if (!runAgentTool) {
    throw new Error("The run_agent tool is not available.");
  }

  await AgentSuggestionFactory.createSubAgent(ctx.auth, teamAssistant, {
    suggestion: {
      action: "add",
      toolId: runAgentTool.sId,
      childAgentId: meetingPrep.value.sId,
    },
    analysis: null,
    source: "conversational",
    batchModelId: batch.id,
  });

  return {
    batch,
    teamAssistant,
    decisionLog: decisionLog.value,
    skillSuggestions: new Map([["createDecisionLog", decisionLogCreation]]),
  };
}

// A batch creating an agent with sub-agents: the new SalesLead agent delegates to the new
// PricingHelper agent of the same batch and to the existing TeamAssistant.
async function seedCreatedSubAgentsBatch(
  ctx: SeedContext,
  teamAssistant: CreatedAgent
): Promise<BatchSuggestionResource> {
  const batch = await BatchSuggestionResource.makeNew(ctx.auth, {
    title: "Delegate sales questions",
    analysis:
      "Sales questions mix pricing and general questions. A new SalesLead agent hands pricing to a new PricingHelper agent and the rest to TeamAssistant.",
    sourceConversation: null,
  });

  const pendingAgents = await AgentResource.createPendings(ctx.auth, [
    "SalesLead",
    "PricingHelper",
  ]);
  if (pendingAgents.isErr()) {
    throw pendingAgents.error;
  }
  const [salesLead, pricingHelper] = pendingAgents.value;

  await AgentSuggestionFactory.createCreate(ctx.auth, salesLead, {
    suggestion: {
      name: "SalesLead",
      description: "Answers sales questions, delegating pricing.",
      instructions:
        "<p>Answer sales questions. Hand pricing questions to PricingHelper and the rest to TeamAssistant.</p>",
      subAgentIds: [pricingHelper.sId, teamAssistant.sId],
    },
    analysis: null,
    batchModelId: batch.id,
  });

  await AgentSuggestionFactory.createCreate(ctx.auth, pricingHelper, {
    suggestion: {
      name: "PricingHelper",
      description: "Answers pricing questions from the price list.",
      instructions: "<p>Answer pricing questions from the price list.</p>",
    },
    analysis: null,
    batchModelId: batch.id,
  });

  return batch;
}

async function seedPendingSkills(
  ctx: SeedContext,
  suggestions: SkillSuggestionAsset[]
): Promise<Map<string, SkillResource>> {
  const pendingSkills = new Map<string, SkillResource>();
  if (!ctx.execute) {
    return pendingSkills;
  }

  for (const { skillName } of suggestions.filter((s) => s.kind === "create")) {
    const pendingSkill = await SkillResource.createPending(ctx.auth);
    if (pendingSkill.isErr()) {
      throw pendingSkill.error;
    }
    pendingSkills.set(skillName, pendingSkill.value);
  }

  return pendingSkills;
}

// Creating a data source needs a running CoreAPI, which test environments may not have: the
// failure is logged and the knowledge suggestion keeps its placeholders.
async function seedGlossaryDataSource(
  ctx: SeedContext,
  dataSources: DataSourceAsset[]
): Promise<DataSourceViewResource | null> {
  try {
    await seedDataSources(ctx, dataSources);
  } catch (e) {
    ctx.logger.warn(
      { error: e },
      "Failed to seed data sources (CoreAPI unavailable?), the knowledge suggestion will have unresolved placeholders"
    );
    return null;
  }

  if (!ctx.execute) {
    return null;
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(
    ctx.auth,
    dataSources[0].name
  );
  if (!dataSource) {
    return null;
  }
  const [view] = await DataSourceViewResource.listForDataSources(ctx.auth, [
    dataSource,
  ]);

  return view ?? null;
}

function resolveSkillSuggestionPlaceholders(
  suggestion: SkillSuggestionAsset,
  placeholders: Record<string, string>
): SkillSuggestionAsset {
  if (suggestion.kind !== "edit") {
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
