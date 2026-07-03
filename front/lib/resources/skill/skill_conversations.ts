import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageSkillModel,
  ConversationSkillModel,
} from "@app/lib/models/skill/conversation_skill";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillReferenceFields } from "@app/lib/resources/skill/types";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";

type ConversationSkillCreationAttributes =
  CreationAttributes<ConversationSkillModel> &
    (
      | {
          source: "conversation";
          agentConfigurationId: null;
        }
      | {
          source: "agent_enabled";
          agentConfigurationId: string;
        }
    );

export async function upsertToConversation(
  auth: Authenticator,
  {
    skillReference,
    conversationId,
    enabled,
  }: {
    skillReference: SkillReferenceFields;
    conversationId: ModelId;
    enabled: boolean;
  },
  { transaction }: { transaction?: Transaction } = {}
): Promise<Result<undefined, Error>> {
  const user = auth.user();
  if (!user) {
    return new Err(new Error("User must be authenticated"));
  }

  const workspace = auth.getNonNullableWorkspace();

  const existingConversationSkill = await ConversationSkillModel.findOne({
    where: {
      ...skillReference,
      workspaceId: workspace.id,
      conversationId,
      agentConfigurationId: null,
    },
    transaction,
  });

  if (existingConversationSkill && !enabled) {
    await existingConversationSkill.destroy({ transaction });
    return new Ok(undefined);
  }

  if (!existingConversationSkill && enabled) {
    await ConversationSkillModel.create(
      {
        ...skillReference,
        conversationId,
        workspaceId: workspace.id,
        agentConfigurationId: null,
        source: "conversation",
        addedByUserId: user.id,
      } satisfies ConversationSkillCreationAttributes,
      { transaction }
    );
    return new Ok(undefined);
  }

  return new Ok(undefined);
}

export async function upsertConversationSkills(
  auth: Authenticator,
  {
    conversationId,
    skills,
    enabled,
  }: {
    conversationId: ModelId;
    skills: SkillResource[];
    enabled: boolean;
  },
  { transaction }: { transaction?: Transaction } = {}
): Promise<Result<undefined, Error>> {
  for (const skill of skills) {
    const result = await skill.upsertToConversation(
      auth,
      {
        conversationId,
        enabled,
      },
      { transaction }
    );

    if (result.isErr()) {
      return result;
    }
  }

  return new Ok(undefined);
}

export async function clearAllEnabledByConversation(
  auth: Authenticator,
  {
    conversation,
  }: {
    conversation: ConversationWithoutContentType;
  },
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  await ConversationSkillModel.destroy({
    where: {
      workspaceId: workspace.id,
      conversationId: conversation.id,
    },
    transaction,
  });
}

export async function enableForAgent(
  auth: Authenticator,
  {
    skillReference,
    agentConfiguration,
    conversation,
  }: {
    skillReference: SkillReferenceFields;
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationType;
  }
): Promise<{ wasAlreadyEnabled: boolean }> {
  const workspace = auth.getNonNullableWorkspace();

  const conversationSkillBlob: ConversationSkillCreationAttributes = {
    ...skillReference,
    workspaceId: workspace.id,
    conversationId: conversation.id,
    addedByUserId: null,
    source: "agent_enabled",
    agentConfigurationId: agentConfiguration.sId,
  };

  // Check if this skill is already enabled for this agent in this conversation.
  const existingConversationSkill = await ConversationSkillModel.findOne({
    where: conversationSkillBlob,
  });

  if (existingConversationSkill) {
    return { wasAlreadyEnabled: true };
  }

  await ConversationSkillModel.create(conversationSkillBlob);

  return { wasAlreadyEnabled: false };
}

export async function snapshotConversationSkillsForMessage(
  auth: Authenticator,
  {
    agentConfigurationId,
    agentMessageId,
    conversationId,
  }: {
    agentConfigurationId: string;
    agentMessageId: ModelId;
    conversationId: ModelId;
  }
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  const conversationSkills = await ConversationSkillModel.findAll({
    where: {
      workspaceId: workspace.id,
      conversationId,
      [Op.or]: [{ agentConfigurationId }, { agentConfigurationId: null }],
    },
  });

  await AgentMessageSkillModel.bulkCreate(
    conversationSkills.map((cs) => ({
      workspaceId: workspace.id,
      agentConfigurationId: cs.agentConfigurationId,
      customSkillId: cs.customSkillId,
      globalSkillId: cs.globalSkillId,
      agentMessageId,
      conversationId: cs.conversationId,
      source: cs.source,
      addedByUserId: cs.addedByUserId,
    }))
  );
}

export async function listAgentMessageSkillsByCustomSkills(
  auth: Authenticator,
  customSkills: SkillResource[]
): Promise<
  {
    skill: SkillResource;
    conversationModelId: ModelId;
    agentConfigurationId: string | null;
    createdAt: Date;
  }[]
> {
  if (customSkills.length === 0) {
    return [];
  }

  const workspace = auth.getNonNullableWorkspace();

  const skillsById = new Map(customSkills.map((s) => [s.id, s]));

  const records = await AgentMessageSkillModel.findAll({
    attributes: [
      "createdAt",
      "conversationId",
      "customSkillId",
      "agentConfigurationId",
    ],
    where: {
      workspaceId: workspace.id,
      customSkillId: {
        [Op.ne]: null,
        [Op.in]: [...skillsById.keys()],
      },
    },
  });

  return removeNulls(
    records.map((r) => {
      if (r.customSkillId === null) {
        return null;
      }
      const skill = skillsById.get(r.customSkillId);
      if (!skill) {
        return null;
      }
      return {
        skill,
        conversationModelId: r.conversationId,
        agentConfigurationId: r.agentConfigurationId,
        createdAt: r.createdAt,
      };
    })
  );
}
