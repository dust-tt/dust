import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageSkillModel,
  ConversationSkillModel,
} from "@app/lib/models/skill/conversation_skill";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillResourceWithReferences } from "@app/lib/resources/skill/skill_resource_references";
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

/**
 * Layer of the SkillResource inheritance chain owning the conversation skills
 * domain: skills enabled in a conversation and their per-message snapshots.
 */
export abstract class SkillResourceWithConversations extends SkillResourceWithReferences {
  async upsertToConversation(
    auth: Authenticator,
    {
      conversationId,
      enabled,
    }: {
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
        ...this.skillReference,
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
          ...this.skillReference,
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

  static async upsertConversationSkills(
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

  static async clearAllEnabledByConversation(
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

  async enableForAgent(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
    }: {
      agentConfiguration: AgentConfigurationType;
      conversation: ConversationType;
    }
  ): Promise<{ wasAlreadyEnabled: boolean }> {
    const workspace = auth.getNonNullableWorkspace();

    const conversationSkillBlob: ConversationSkillCreationAttributes = {
      ...this.skillReference,
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

  static async snapshotConversationSkillsForMessage(
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

  static async listAgentMessageSkillsByCustomSkills(
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
}
