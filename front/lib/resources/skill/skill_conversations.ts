import { getEffectiveSpaceIdsForAgentRun } from "@app/lib/api/assistant/conversation/selected_spaces";
import { updateConversationRequirementsForSkills } from "@app/lib/api/assistant/conversation/skill_permissions";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageSkillModel,
  ConversationSkillModel,
} from "@app/lib/models/skill/conversation_skill";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import { getSkillReference } from "@app/lib/resources/skill/skill_references";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type {
  SkillFetchContext,
  SkillReferenceFetcher,
} from "@app/lib/resources/skill/types";
import type { AgentConfigurationWithoutModelType } from "@app/types/assistant/agent";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type {
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { CreationAttributes, Transaction, WhereOptions } from "sequelize";
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

export async function listEnabledByConversation(
  fetchReferencedSkills: SkillReferenceFetcher,
  auth: Authenticator,
  {
    conversation,
    agentConfiguration,
    agentLoopData,
    effectiveSpaceIds,
    transaction,
  }: SkillFetchContext & {
    conversation: ConversationWithoutContentType | ConversationResource;
    agentConfiguration?: AgentConfigurationWithoutModelType;
    transaction?: Transaction;
  }
): Promise<SkillResource[]> {
  const resolvedAgentConfiguration =
    agentConfiguration ?? agentLoopData?.agentConfiguration;
  const workspace = auth.getNonNullableWorkspace();

  const conversationSkills = await ConversationSkillModel.findAll({
    where: {
      workspaceId: workspace.id,
      conversationId: conversation.id,
      ...(resolvedAgentConfiguration
        ? {
            [Op.or]: [
              { agentConfigurationId: resolvedAgentConfiguration.sId },
              { agentConfigurationId: null },
            ],
          }
        : { agentConfigurationId: null }),
    },
    transaction,
  });

  return fetchReferencedSkills(auth, conversationSkills, {
    agentLoopData,
    effectiveSpaceIds,
    transaction,
  });
}

export async function listPodDefaultSkillsForConversation(
  resourceClass: typeof SkillResource,
  auth: Authenticator,
  {
    conversation,
    agentLoopData,
    effectiveSpaceIds,
  }: {
    conversation: ConversationWithoutContentType;
    agentLoopData?: AgentLoopExecutionData;
    effectiveSpaceIds: string[];
  }
): Promise<SkillResource[]> {
  if (!isPodConversation(conversation)) {
    return [];
  }

  const [projectMetadata] = await ProjectMetadataResource.fetchBySpaceIds(
    auth,
    [conversation.spaceId]
  );

  return resourceClass.fetchByIds(
    auth,
    projectMetadata?.defaultSkillIds ?? [],
    {
      agentLoopData,
      effectiveSpaceIds,
      onlyActive: true,
    }
  );
}

export async function listForAgentLoop(
  resourceClass: typeof SkillResource,
  fetchReferencedSkills: SkillReferenceFetcher,
  auth: Authenticator,
  params:
    | AgentLoopExecutionData
    | Pick<AgentLoopExecutionData, "agentConfiguration" | "conversation">
    | {
        agentConfiguration: AgentConfigurationWithoutModelType;
        conversation: ConversationWithoutContentType;
      }
): Promise<{
  effectiveSpaceIds: string[];
  hasSelectedSpacesOutsideAgentScope: boolean;
  enabledSkills: SkillResource[];
  systemSkills: SkillResource[];
  equippedSkills: SkillResource[];
  favoriteSkills: SkillResource[];
}> {
  const { agentConfiguration, conversation } = params;
  // Light type-guard to check whether we have a full AgentLoopExecutionData.
  const agentLoopData = "userMessage" in params ? params : undefined;
  const effectiveSpaceIds = await getEffectiveSpaceIdsForAgentRun(auth, {
    agentConfiguration,
    conversation,
  });
  const requestedSpaceIds = new Set(agentConfiguration.requestedSpaceIds);
  const hasSelectedSpacesOutsideAgentScope = effectiveSpaceIds.some(
    (spaceId) => !requestedSpaceIds.has(spaceId)
  );

  const conversationEnabledSkills =
    await resourceClass.listEnabledByConversation(auth, {
      conversation,
      agentConfiguration,
      agentLoopData,
      effectiveSpaceIds,
    });

  const podDefaultSkills =
    await resourceClass.listPodDefaultSkillsForConversation(auth, {
      conversation,
      agentLoopData,
      effectiveSpaceIds,
    });

  const allAgentSkills = await resourceClass.listByAgentConfiguration(
    auth,
    agentConfiguration,
    { agentLoopData, effectiveSpaceIds }
  );

  let discoverableSkills: SkillResource[] = [];
  let favoriteSkills: SkillResource[] = [];
  if (allAgentSkills.some((s) => s.sId === "discover_skills")) {
    discoverableSkills = await resourceClass.listDiscoverable(auth, {
      agentLoopData,
      effectiveSpaceIds,
    });
    favoriteSkills = await resourceClass.listFavoritesForCurrentUser(auth, {
      agentLoopData,
      effectiveSpaceIds,
    });
  }

  const sortByName = (a: SkillResource, b: SkillResource) =>
    a.name.localeCompare(b.name);

  // Code-defined skills can auto-add themselves for the current loop.
  // Returning "enabled" promotes a global skill to a system skill.
  // `findAll` already drops restricted skills, so a flag-gated skill only
  // shows up once its feature flag is on.
  const autoEnabledSkillRefs: {
    globalSkillId: string;
    customSkillId: null;
  }[] = [];
  const autoEquippedSkillRefs: {
    globalSkillId: string;
    customSkillId: null;
  }[] = [];
  for (const def of [
    ...(await SystemSkillsRegistry.findAll(auth)),
    ...(await GlobalSkillsRegistry.findAll(auth)),
  ]) {
    switch (
      def.getAutoEnabledOrEquippedForAgentLoop?.({
        agentConfiguration,
        conversation,
      })
    ) {
      case "enabled":
        autoEnabledSkillRefs.push({
          globalSkillId: def.sId,
          customSkillId: null,
        });
        break;
      case "equipped":
        autoEquippedSkillRefs.push({
          globalSkillId: def.sId,
          customSkillId: null,
        });
        break;
      default:
        break;
    }
  }

  const autoEnabledSkills = autoEnabledSkillRefs.length
    ? await fetchReferencedSkills(auth, autoEnabledSkillRefs, {
        agentLoopData,
        effectiveSpaceIds,
      })
    : [];

  const autoEquippedSkills = autoEquippedSkillRefs.length
    ? await fetchReferencedSkills(auth, autoEquippedSkillRefs, {
        agentLoopData,
        effectiveSpaceIds,
        withInstructions: false,
        withTools: false,
        withFileAttachments: false,
      })
    : [];

  const systemSkillsFromAgent = allAgentSkills.filter((s) => s.isSystemSkill);

  // Active baseline skills for this loop: configured system skills, plus
  // code-defined skills that this context promotes to system prompt content.
  const systemSkills = [
    ...new Map(
      [...systemSkillsFromAgent, ...autoEnabledSkills].map((s) => [s.sId, s])
    ).values(),
  ];
  const systemSkillIds = new Set(systemSkills.map((skill) => skill.sId));

  // Equipped skills are the workspace-shared enable-able candidates shown to
  // the model. User-specific favorites are returned separately so they don't
  // invalidate the shared prompt cache prefix.
  const equippedSkillsById = new Map<string, SkillResource>();
  for (const skill of [
    ...autoEquippedSkills,
    ...discoverableSkills,
    ...podDefaultSkills,
    ...allAgentSkills,
  ]) {
    if (!systemSkillIds.has(skill.sId) && !equippedSkillsById.has(skill.sId)) {
      equippedSkillsById.set(skill.sId, skill);
    }
  }

  return {
    effectiveSpaceIds,
    hasSelectedSpacesOutsideAgentScope,
    systemSkills: systemSkills.sort(sortByName),
    enabledSkills: conversationEnabledSkills
      .filter((s) => !systemSkillIds.has(s.sId))
      .sort(sortByName),
    equippedSkills: [...equippedSkillsById.values()].sort(sortByName),
    favoriteSkills: favoriteSkills
      .filter(
        (skill) =>
          !systemSkillIds.has(skill.sId) && !equippedSkillsById.has(skill.sId)
      )
      .sort(sortByName),
  };
}

export async function upsertToConversation(
  skillResource: SkillResource,
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
      ...getSkillReference(skillResource),
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
        ...getSkillReference(skillResource),
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
    conversation,
    skills,
    enabled,
  }: {
    conversation: ConversationWithoutContentType;
    skills: SkillResource[];
    enabled: boolean;
  },
  { transaction }: { transaction?: Transaction } = {}
): Promise<Result<undefined, Error>> {
  for (const skill of skills) {
    const result = await skill.upsertToConversation(
      auth,
      {
        conversationId: conversation.id,
        enabled,
      },
      { transaction }
    );

    if (result.isErr()) {
      return result;
    }
  }

  // When enabling skills, append their space requirements to the conversation so access is
  // gated on those spaces (no-op for project conversations).
  if (enabled) {
    await updateConversationRequirementsForSkills(auth, {
      skills,
      conversation,
      t: transaction,
    });
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
  skillResource: SkillResource,
  auth: Authenticator,
  {
    agentConfiguration,
    conversation,
  }: {
    agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
    conversation: ConversationType;
  }
): Promise<{ wasAlreadyEnabled: boolean }> {
  const workspace = auth.getNonNullableWorkspace();

  const conversationSkillBlob: ConversationSkillCreationAttributes = {
    ...getSkillReference(skillResource),
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

  // Append the skill's space requirements to the conversation so access is gated on those
  // spaces (no-op for project conversations).
  await updateConversationRequirementsForSkills(auth, {
    skills: [skillResource],
    conversation,
  });

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

export async function listByAgentMessageId(
  fetchReferencedSkills: SkillReferenceFetcher,
  auth: Authenticator,
  agentMessageId: ModelId,
  { withToolMetadata = false }: { withToolMetadata?: boolean } = {}
): Promise<SkillResource[]> {
  const workspace = auth.getNonNullableWorkspace();

  const where: WhereOptions<AgentMessageSkillModel> = {
    workspaceId: workspace.id,
    agentMessageId,
  };

  const agentMessageSkills = await AgentMessageSkillModel.findAll({
    where,
  });

  // Include all statuses for historical accuracy.
  return fetchReferencedSkills(auth, agentMessageSkills, {
    status: ["active", "archived", "suggested"],
    withToolMetadata,
  });
}

export async function listByConversationModelId(
  fetchReferencedSkills: SkillReferenceFetcher,
  auth: Authenticator,
  conversationModelId: ModelId
): Promise<SkillResource[]> {
  const workspace = auth.getNonNullableWorkspace();

  const agentMessageSkills = await AgentMessageSkillModel.findAll({
    where: {
      workspaceId: workspace.id,
      conversationId: conversationModelId,
    },
  });

  // Include all statuses for historical accuracy.
  return fetchReferencedSkills(auth, agentMessageSkills, {
    status: ["active", "archived", "suggested"],
  });
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
