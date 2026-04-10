import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageFeedbackModel,
  AgentMessageModel,
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { AgentMessageSkillModel } from "@app/lib/models/skill/conversation_skill";
import { SkillSuggestionModel } from "@app/lib/models/skill/skill_suggestion";
import { frontSequelize } from "@app/lib/resources/storage";
import { makeSId } from "@app/lib/resources/string_ids";
import { daysAgo } from "@app/lib/utils/timestamps";
import logger from "@app/logger/logger";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { ModelId } from "@app/types/shared/model_id";
import { Op } from "sequelize";

import {
  DEFAULT_MAX_CONVERSATIONS_PER_RUN,
  PENDING_SUGGESTION_MAX_AGE_DAYS,
  PER_SKILL_CONVERSATION_CAP,
  SKILL_STALENESS_THRESHOLD_DAYS,
  WEIGHT_FEEDBACK,
  WEIGHT_TOOL_ERRORS,
  WEIGHT_USER_ENGAGEMENT,
} from "./constants";

export interface ConversationWithSkills {
  conversationId: string;
  skillIds: string[];
}

// Minimum user messages required for a conversation to be eligible
// (when it has no feedback).
const MIN_USER_MESSAGES = 2;

interface ConversationSignals {
  userMessageCount: Map<ModelId, number>;
  feedbackCount: Map<ModelId, number>;
  toolErrorCount: Map<ModelId, number>;
}

interface ScoredConversation {
  conversationModelId: ModelId;
  conversationId: string;
  skillIds: string[];
  score: number;
}

/**
 * Stage 1: Determine which custom skills are eligible for reinforcement.
 *
 * A skill is excluded if:
 * - It has not been modified in the last SKILL_STALENESS_THRESHOLD_DAYS days.
 * - It has pending suggestions with source=reinforcement younger than
 *   PENDING_SUGGESTION_MAX_AGE_DAYS days.
 */
async function fetchEligibleSkillIds(
  auth: Authenticator
): Promise<Set<ModelId>> {
  const workspace = auth.getNonNullableWorkspace();
  const stalenessThreshold = daysAgo(SKILL_STALENESS_THRESHOLD_DAYS);
  const pendingSuggestionCutoff = daysAgo(PENDING_SUGGESTION_MAX_AGE_DAYS);

  // Parallel queries: stale skills and skills with pending reinforcement suggestions.
  const [recentSkills, pendingSuggestions] = await Promise.all([
    // Active skills that have been modified recently.
    SkillConfigurationModel.findAll({
      attributes: ["id"],
      where: {
        workspaceId: workspace.id,
        status: "active",
        updatedAt: { [Op.gte]: stalenessThreshold },
      },
    }),
    // Pending reinforcement suggestions.
    SkillSuggestionModel.findAll({
      attributes: ["skillConfigurationId"],
      where: {
        workspaceId: workspace.id,
        state: "pending",
        source: "reinforcement",
        createdAt: { [Op.gte]: pendingSuggestionCutoff },
      },
    }),
  ]);

  const skillsWithPendingSuggestions = new Set(
    pendingSuggestions.map((s) => s.skillConfigurationId)
  );

  const eligibleIds = new Set<ModelId>();
  for (const skill of recentSkills) {
    if (!skillsWithPendingSuggestions.has(skill.id)) {
      eligibleIds.add(skill.id);
    }
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      recentSkillCount: recentSkills.length,
      pendingSuggestionSkillCount: skillsWithPendingSuggestions.size,
      eligibleSkillCount: eligibleIds.size,
    },
    "ReinforcedSkills: eligible skill determination"
  );

  return eligibleIds;
}

/**
 * Stage 2: Discover conversations that used eligible custom skills,
 * filtering out conversations where skills were invoked by custom agents.
 */
async function discoverConversations(
  auth: Authenticator,
  {
    eligibleSkillIds,
    cutoffDate,
    skillId,
  }: {
    eligibleSkillIds: Set<ModelId>;
    cutoffDate: Date;
    skillId?: string;
  }
): Promise<{
  conversationSkillMap: Map<ModelId, Set<string>>;
  convModelIdToId: Map<ModelId, string>;
}> {
  const workspace = auth.getNonNullableWorkspace();

  if (eligibleSkillIds.size === 0) {
    return { conversationSkillMap: new Map(), convModelIdToId: new Map() };
  }

  // Query AgentMessageSkillModel for eligible custom skills.
  const skillRecords = await AgentMessageSkillModel.findAll({
    attributes: ["conversationId", "customSkillId", "agentConfigurationId"],
    where: {
      workspaceId: workspace.id,
      customSkillId: { [Op.in]: [...eligibleSkillIds] },
    },
  });

  if (skillRecords.length === 0) {
    return { conversationSkillMap: new Map(), convModelIdToId: new Map() };
  }

  // Post-filter: discard records where the skill was invoked by a custom agent.
  // A null agentConfigurationId means the skill was added to the conversation
  // directly (not via an agent config), which is eligible.
  const filteredRecords = skillRecords.filter(
    (r) =>
      r.agentConfigurationId === null || isGlobalAgentId(r.agentConfigurationId)
  );

  if (filteredRecords.length === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "ReinforcedSkills: all skill records were from custom agents, none eligible"
    );
    return { conversationSkillMap: new Map(), convModelIdToId: new Map() };
  }

  // Get unique conversation IDs and fetch qualifying conversations.
  const allConvIds = [...new Set(filteredRecords.map((r) => r.conversationId))];

  const conversations = await ConversationModel.findAll({
    attributes: ["id", "sId"],
    where: {
      workspaceId: workspace.id,
      id: { [Op.in]: allConvIds },
      visibility: { [Op.ne]: "test" },
      createdAt: { [Op.gte]: cutoffDate },
    },
  });

  const convModelIdToId = new Map<ModelId, string>(
    conversations.map((c) => [c.id, c.sId])
  );

  // Build conversationId -> Set<skillId> map.
  const conversationSkillMap = new Map<ModelId, Set<string>>();

  for (const record of filteredRecords) {
    const convId = convModelIdToId.get(record.conversationId);
    if (!convId) {
      continue;
    }

    const customSkillId = record.customSkillId;
    if (!customSkillId) {
      continue;
    }

    const localSkillId = makeSId("skill", {
      id: customSkillId,
      workspaceId: workspace.id,
    });

    // If filtering by a specific skill, only include matching skills.
    if (skillId && localSkillId !== skillId) {
      continue;
    }

    if (!conversationSkillMap.has(record.conversationId)) {
      conversationSkillMap.set(record.conversationId, new Set());
    }
    conversationSkillMap.get(record.conversationId)!.add(localSkillId);
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      skillRecordsCount: skillRecords.length,
      filteredRecordsCount: filteredRecords.length,
      candidateConversationCount: conversationSkillMap.size,
    },
    "ReinforcedSkills: conversation discovery"
  );

  return { conversationSkillMap, convModelIdToId: convModelIdToId };
}

/**
 * Stage 3: Batch-fetch scoring signals for candidate conversations.
 *
 * Runs three parallel queries for user message counts, feedback counts,
 * and tool error counts.
 */
async function fetchConversationSignals(
  workspaceId: ModelId,
  conversationIds: ModelId[]
): Promise<ConversationSignals> {
  if (conversationIds.length === 0) {
    return {
      userMessageCount: new Map(),
      feedbackCount: new Map(),
      toolErrorCount: new Map(),
    };
  }

  const [userMessageRows, feedbackRows, toolErrorRows] = await Promise.all([
    // User message counts per conversation.
    MessageModel.findAll({
      attributes: [
        "conversationId",
        [frontSequelize.fn("COUNT", frontSequelize.col("message.id")), "count"],
      ],
      where: {
        workspaceId,
        conversationId: { [Op.in]: conversationIds },
        userMessageId: { [Op.ne]: null },
      },
      group: ["conversationId"],
      raw: true,
    }),

    // Feedback counts per conversation.
    AgentMessageFeedbackModel.findAll({
      attributes: [
        "conversationId",
        [frontSequelize.fn("COUNT", frontSequelize.col("id")), "count"],
      ],
      where: {
        workspaceId,
        conversationId: { [Op.in]: conversationIds },
      },
      group: ["conversationId"],
      raw: true,
    }),

    // Tool error counts: agent messages with failed status, joined through MessageModel.
    MessageModel.findAll({
      attributes: [
        "conversationId",
        [frontSequelize.fn("COUNT", frontSequelize.col("message.id")), "count"],
      ],
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          attributes: [],
          required: true,
          where: { status: "failed" },
        },
      ],
      where: {
        workspaceId,
        conversationId: { [Op.in]: conversationIds },
        agentMessageId: { [Op.ne]: null },
      },
      group: ["message.conversationId"],
      raw: true,
    }),
  ]);

  const userMessageCount = new Map<ModelId, number>();
  for (const row of userMessageRows) {
    const r = row as unknown as { conversationId: ModelId; count: string };
    userMessageCount.set(r.conversationId, parseInt(r.count, 10));
  }

  const feedbackCount = new Map<ModelId, number>();
  for (const row of feedbackRows) {
    const r = row as unknown as { conversationId: ModelId; count: string };
    feedbackCount.set(r.conversationId, parseInt(r.count, 10));
  }

  const toolErrorCount = new Map<ModelId, number>();
  for (const row of toolErrorRows) {
    const r = row as unknown as { conversationId: ModelId; count: string };
    toolErrorCount.set(r.conversationId, parseInt(r.count, 10));
  }

  return { userMessageCount, feedbackCount, toolErrorCount };
}

/**
 * Stage 4: Score conversations and apply per-skill capping.
 *
 * Each conversation is scored based on feedback, tool errors, and user
 * engagement. Conversations are then selected in score order, respecting
 * per-skill caps.
 */
function scoreAndSelectConversations(
  conversationSkillMap: Map<ModelId, Set<string>>,
  convModelIdToId: Map<ModelId, string>,
  signals: ConversationSignals,
  maxConversations: number
): ConversationWithSkills[] {
  // Filter conversations by eligibility: must have feedback OR >= MIN_USER_MESSAGES.
  const eligible: {
    conversationModelId: ModelId;
    skillIds: string[];
    feedback: number;
    userMessages: number;
    toolErrors: number;
  }[] = [];

  for (const [convModelId, skillIds] of conversationSkillMap) {
    const feedback = signals.feedbackCount.get(convModelId) ?? 0;
    const userMessages = signals.userMessageCount.get(convModelId) ?? 0;

    if (feedback === 0 && userMessages < MIN_USER_MESSAGES) {
      continue;
    }

    eligible.push({
      conversationModelId: convModelId,
      skillIds: [...skillIds],
      feedback,
      userMessages,
      toolErrors: signals.toolErrorCount.get(convModelId) ?? 0,
    });
  }

  if (eligible.length === 0) {
    return [];
  }

  // Normalize signals by dividing by max across all eligible conversations.
  const maxFeedback = Math.max(0, ...eligible.map((c) => c.feedback));
  const maxToolErrors = Math.max(0, ...eligible.map((c) => c.toolErrors));
  // For engagement, use messages beyond the minimum.
  const maxEngagement = Math.max(
    0,
    ...eligible.map((c) => Math.max(0, c.userMessages - MIN_USER_MESSAGES))
  );

  const scored: ScoredConversation[] = eligible.map((c) => {
    const normalizedFeedback = maxFeedback > 0 ? c.feedback / maxFeedback : 0;
    const normalizedToolErrors =
      maxToolErrors > 0 ? c.toolErrors / maxToolErrors : 0;
    const engagement = Math.max(0, c.userMessages - MIN_USER_MESSAGES);
    const normalizedEngagement =
      maxEngagement > 0 ? engagement / maxEngagement : 0;

    const score =
      WEIGHT_FEEDBACK * normalizedFeedback +
      WEIGHT_TOOL_ERRORS * normalizedToolErrors +
      WEIGHT_USER_ENGAGEMENT * normalizedEngagement;

    return {
      conversationModelId: c.conversationModelId,
      conversationId: convModelIdToId.get(c.conversationModelId)!,
      skillIds: c.skillIds,
      score,
    };
  });

  // Sort by score descending.
  scored.sort((a, b) => b.score - a.score);

  // Score-then-cap pass: walk sorted list, enforce per-skill caps.
  const skillConversationCount = new Map<string, number>();
  const results: ConversationWithSkills[] = [];

  for (const conv of scored) {
    if (results.length >= maxConversations) {
      break;
    }

    // Determine which skills still have room under the per-skill cap.
    const eligibleSkillIds = conv.skillIds.filter((sid) => {
      const count = skillConversationCount.get(sid) ?? 0;
      return count < PER_SKILL_CONVERSATION_CAP;
    });

    if (eligibleSkillIds.length === 0) {
      continue;
    }

    // Include this conversation for the skills that still have room.
    results.push({
      conversationId: conv.conversationId,
      skillIds: eligibleSkillIds,
    });

    // Increment counters for the selected skills.
    for (const sid of eligibleSkillIds) {
      skillConversationCount.set(
        sid,
        (skillConversationCount.get(sid) ?? 0) + 1
      );
    }
  }

  return results;
}

/**
 * Discover and select recent conversations that used custom skills,
 * applying a scoring-based selection pipeline.
 *
 * Pipeline stages:
 * 1. Determine eligible skills (not stale, no pending suggestions).
 * 2. Discover conversations using those skills (global agents only).
 * 3. Batch-fetch scoring signals (feedback, user messages, tool errors).
 * 4. Filter, score, and cap conversations per skill.
 */
export async function findConversationsWithSkills(
  auth: Authenticator,
  {
    cutoffDate,
    maxConversations = DEFAULT_MAX_CONVERSATIONS_PER_RUN,
    skillId,
  }: {
    cutoffDate: Date;
    maxConversations?: number;
    skillId?: string;
  }
): Promise<ConversationWithSkills[]> {
  const workspace = auth.getNonNullableWorkspace();

  // Stage 1: Eligible skills.
  const eligibleSkillIds = await fetchEligibleSkillIds(auth);
  if (eligibleSkillIds.size === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "ReinforcedSkills: no eligible skills found, skipping"
    );
    return [];
  }

  // Stage 2: Discover conversations.
  const { conversationSkillMap, convModelIdToId } = await discoverConversations(
    auth,
    {
      eligibleSkillIds,
      cutoffDate,
      skillId,
    }
  );
  if (conversationSkillMap.size === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "ReinforcedSkills: no qualifying conversations found"
    );
    return [];
  }

  // Stage 3: Fetch signals.
  const candidateConversationIds = [...conversationSkillMap.keys()];
  const signals = await fetchConversationSignals(
    workspace.id,
    candidateConversationIds
  );

  // Stage 4: Score and select.
  const results = scoreAndSelectConversations(
    conversationSkillMap,
    convModelIdToId,
    signals,
    maxConversations
  );

  logger.info(
    {
      workspaceId: workspace.sId,
      candidateConversations: conversationSkillMap.size,
      selectedConversations: results.length,
    },
    "ReinforcedSkills: conversation selection complete"
  );

  return results;
}
