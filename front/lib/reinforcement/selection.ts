import type { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { AgentMessageSkillModel } from "@app/lib/models/skill/conversation_skill";
import { makeSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import { Op } from "sequelize";

export interface ConversationWithSkills {
  conversationId: string;
  skillIds: string[];
}

/**
 * Discover recent conversations that used custom skills.
 *
 * Queries AgentMessageSkillModel joined with ConversationModel to find
 * conversations in the workspace that used custom skills within the given
 * date range. Excludes test conversations and optionally filters by skill.
 */
export async function findConversationsWithSkills(
  auth: Authenticator,
  {
    cutoffDate,
    maxConversations,
    skillId,
  }: {
    cutoffDate: Date;
    maxConversations: number;
    skillId?: string;
  }
): Promise<ConversationWithSkills[]> {
  const workspace = auth.getNonNullableWorkspace();

  // Step 1: Find all agent_message_skills records with custom skills.
  const skillRecords = await AgentMessageSkillModel.findAll({
    attributes: ["conversationId", "customSkillId"],
    where: {
      workspaceId: workspace.id,
      customSkillId: { [Op.ne]: null },
    },
  });

  if (skillRecords.length === 0) {
    logger.info(
      {
        workspaceId: workspace.sId,
        cutoffDate: cutoffDate.toISOString(),
      },
      "ReinforcedSkills: no agent message skill records with custom skills found"
    );
    return [];
  }

  // Step 2: Get the unique conversation IDs and fetch qualifying conversations.
  const allConvIds: ModelId[] = [
    ...new Set(skillRecords.map((r) => r.conversationId)),
  ];

  const conversations = await ConversationModel.findAll({
    attributes: ["id", "sId"],
    where: {
      workspaceId: workspace.id,
      id: { [Op.in]: allConvIds },
      visibility: { [Op.ne]: "test" },
      createdAt: { [Op.gte]: cutoffDate },
    },
  });

  if (conversations.length === 0) {
    logger.info(
      {
        workspaceId: workspace.sId,
        cutoffDate: cutoffDate.toISOString(),
      },
      "ReinforcedSkills: no qualifying conversations found"
    );
    return [];
  }

  const convIdById = new Map<ModelId, string>(
    conversations.map((c) => [c.id, c.sId])
  );

  // Step 3: Build a map of conversationId -> Set<skillId>.
  const conversationSkillMap = new Map<string, Set<string>>();

  for (const record of skillRecords) {
    const convId = convIdById.get(record.conversationId);
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

    // If filtering by skillId, only include matching skills.
    if (skillId && localSkillId !== skillId) {
      continue;
    }

    if (!conversationSkillMap.has(convId)) {
      conversationSkillMap.set(convId, new Set());
    }
    conversationSkillMap.get(convId)!.add(localSkillId);
  }

  // Step 4: Convert to array and cap at maxConversations.
  const results: ConversationWithSkills[] = [];
  for (const [conversationId, skillIds] of conversationSkillMap) {
    if (results.length >= maxConversations) {
      break;
    }
    results.push({
      conversationId,
      skillIds: [...skillIds],
    });
  }

  return results;
}
