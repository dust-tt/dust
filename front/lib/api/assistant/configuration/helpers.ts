import { fetchMCPServerActionConfigurations } from "@app/lib/actions/configuration/mcp";
import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import { shadowCompare } from "@app/lib/api/permissions/shadow";
import type { Authenticator } from "@app/lib/auth";
import { getPublicUploadBucket } from "@app/lib/file_storage";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { canReadRequestedSpaces } from "@app/lib/resources/permission_utils";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillHydrationOptions } from "@app/lib/resources/skill/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { tagsSorter } from "@app/lib/utils";
import type {
  AgentConfigurationType,
  AgentConfigurationWithSkillsType,
  AgentFetchVariant,
  AgentModelConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import partition from "lodash/partition";
import uniq from "lodash/uniq";

const LABELS_ONLY_FETCH_OPTIONS: SkillHydrationOptions = {
  withInstructions: false,
  withTools: false,
  withFileAttachments: false,
};

export function getModelForAgentConfiguration(
  agent: AgentConfigurationModel
): AgentModelConfigurationType {
  const model: AgentModelConfigurationType = {
    providerId: agent.providerId,
    modelId: agent.modelId,
    temperature: agent.temperature,
  };

  if (agent.responseFormat) {
    model.responseFormat = agent.responseFormat;
  }

  // Always set reasoning effort, using model default if null/undefined
  if (agent.reasoningEffort) {
    model.reasoningEffort = agent.reasoningEffort;
  } else {
    // Get the model configuration to use default reasoning effort
    const modelConfig = getSupportedModelConfig({
      providerId: agent.providerId,
      modelId: agent.modelId,
    });
    if (modelConfig) {
      model.reasoningEffort = modelConfig.defaultReasoningEffort;
    }
  }

  return model;
}

export async function isSelfHostedImageWithValidContentType(
  pictureUrl: string
) {
  // Accept static Dust avatars.
  if (pictureUrl.startsWith("https://dust.tt/static/")) {
    return true;
  }

  const filename = pictureUrl.split("/").at(-1);
  if (!filename) {
    return false;
  }

  // Attempt to decode the URL, since Google Cloud Storage URL encodes the filename.
  const contentTypeResult = await getPublicUploadBucket().getFileContentType(
    decodeURIComponent(filename)
  );
  if (contentTypeResult.isErr() || !contentTypeResult.value) {
    return false;
  }

  return contentTypeResult.value.includes("image");
}

export async function getAgentIdFromName(
  auth: Authenticator,
  name: string
): Promise<string | null> {
  const owner = auth.getNonNullableWorkspace();

  const agent = await AgentConfigurationModel.findOne({
    attributes: ["sId"],
    where: {
      workspaceId: owner.id,
      name,
      status: "active",
    },
  });

  if (!agent) {
    return null;
  }

  return agent.sId;
}

async function shadowAgentPermissions(
  auth: Authenticator,
  agentModels: AgentConfigurationModel[],
  legacyAgents: AgentConfigurationType[],
  spaceById: Map<ModelId, SpaceResource>
): Promise<void> {
  const isRegularApiKey = auth.isKey() && !auth.isSystemKey();
  await shadowCompare({
    auth,
    legacy: legacyAgents.map((agent) => ({
      agentId: agent.sId,
      agentConfigurationModelId: agent.id,
      read: agent.canRead || auth.isAdmin(),
      write: agent.canEdit,
      admin: agent.canEdit || auth.isAdmin(),
    })),
    candidate: async () =>
      agentModels.map((agent) => {
        const resource = AgentResource.fromAgentConfigurationModel(agent);
        const read = auth.can("read", resource);
        const write =
          auth.can("write", resource) &&
          (!isRegularApiKey ||
            (agent.status === "active" &&
              canReadRequestedSpaces(
                auth,
                spaceById,
                agent.requestedSpaceIds
              )));
        return {
          agentId: agent.sId,
          agentConfigurationModelId: agent.id,
          read,
          write,
          admin: auth.can("admin", resource),
        };
      }),
    context: {
      check: "agent_permissions",
      workspaceId: auth.getNonNullableWorkspace().sId,
      authMethod: auth.authMethod(),
      hasUser: auth.user() !== null,
      isSystemKey: auth.isSystemKey(),
    },
    equals: (legacy, candidate) =>
      legacy.length === candidate.length &&
      legacy.every((permissions, index) => {
        const candidatePermissions = candidate[index];
        return (
          permissions.agentId === candidatePermissions.agentId &&
          permissions.agentConfigurationModelId ===
            candidatePermissions.agentConfigurationModelId &&
          permissions.read === candidatePermissions.read &&
          permissions.write === candidatePermissions.write &&
          permissions.admin === candidatePermissions.admin
        );
      }),
  });
}

/**
 * Enrich agent configurations with additional data (actions, tags, favorites).
 */
/**
 * @cc [owner:philipperolet,label:security] regular-key-agent-editability
 * For regular keys on custom agents, `canEdit` requires workspace admin access, active status,
 * and read access to every requested space.
 */
/**
 * @cc [owner:philipperolet,label:security] agent-editability
 * Outside regular API keys, `canEdit` allows legacy authors/editors or user-less system-key/Poke
 * callers with agent write permission; workspace admin role alone does not grant it.
 */
export async function enrichAgentConfigurations<V extends AgentFetchVariant>(
  auth: Authenticator,
  agentConfigurations: AgentConfigurationModel[],
  {
    variant,
    agentIdsForUserAsEditor,
  }: {
    variant: V;
    agentIdsForUserAsEditor?: ModelId[];
  }
): Promise<AgentConfigurationType[]> {
  const configurationIds = agentConfigurations.map((a) => a.id);
  const configurationSIds = agentConfigurations.map((a) => a.sId);
  const user = auth.user();
  const isRegularApiKey = auth.isKey() && !auth.isSystemKey();

  // Compute editor permissions if not provided
  let editorIds = agentIdsForUserAsEditor;
  if (!editorIds) {
    const agentIdsForGroups = user
      ? await GroupResource.findAgentIdsForGroups(auth, auth.groupModelIds())
      : [];

    editorIds = agentIdsForGroups.map((g) => g.agentConfigurationId);
  }

  const mcpServerActionsConfigurationsPerAgent =
    await fetchMCPServerActionConfigurations(auth, {
      configurationIds,
      variant,
    });
  const favoriteStatePerAgent =
    user && variant !== "extra_light"
      ? await getFavoriteStates(auth, { configurationIds: configurationSIds })
      : new Map<string, boolean>();
  const tagsPerAgent =
    variant !== "extra_light"
      ? await TagResource.listForAgents(auth, configurationIds)
      : [];
  const spacesForApiKey =
    isRegularApiKey && auth.isAdmin()
      ? await SpaceResource.fetchByModelIds(auth, [
          ...new Set(
            agentConfigurations.flatMap((agent) => agent.requestedSpaceIds)
          ),
        ])
      : [];
  const spaceById = new Map(spacesForApiKey.map((space) => [space.id, space]));

  const agentConfigurationTypes: AgentConfigurationType[] = [];
  for (const agent of agentConfigurations) {
    const actions =
      variant === "full"
        ? (mcpServerActionsConfigurationsPerAgent.get(agent.id) ?? [])
        : [];

    const model = getModelForAgentConfiguration(agent);
    const tags: TagResource[] = tagsPerAgent[agent.id] ?? [];

    const isAuthor = agent.authorId === auth.user()?.id;
    const isMember = editorIds.includes(agent.id);
    const canEditWithoutUser =
      !user &&
      (auth.isSystemKey() || auth.isDustSuperUser()) &&
      auth.can("write", AgentResource.fromAgentConfigurationModel(agent));

    const canRead =
      isAuthor || isMember || canEditWithoutUser || agent.scope === "visible";
    const canEdit = isRegularApiKey
      ? auth.isAdmin() &&
        agent.status === "active" &&
        canReadRequestedSpaces(auth, spaceById, agent.requestedSpaceIds)
      : isAuthor || isMember || canEditWithoutUser;
    const agentConfigurationType: AgentConfigurationType = {
      id: agent.id,
      sId: agent.sId,
      versionCreatedAt: agent.createdAt.toISOString(),
      version: agent.version,
      scope: agent.scope,
      userFavorite: !!favoriteStatePerAgent.get(agent.sId),
      name: agent.name,
      pictureUrl: agent.pictureUrl,
      description: agent.description,
      instructions: agent.instructions,
      instructionsHtml: variant === "full" ? agent.instructionsHtml : null,
      model,
      status: agent.status,
      actions,
      versionAuthorId: agent.authorId,
      maxStepsPerRun: agent.maxStepsPerRun,
      templateId: agent.templateId
        ? TemplateResource.modelIdToSId({ id: agent.templateId })
        : null,
      // TODO(2025-10-20 flav): Remove once SDK JS does not rely on it anymore.
      visualizationEnabled: false,
      requestedGroupIds: [],
      requestedSpaceIds: agent.requestedSpaceIds.map((spaceId) =>
        SpaceResource.modelIdToSId({
          id: spaceId,
          workspaceId: auth.getNonNullableWorkspace().id,
        })
      ),
      tags: tags.map((t) => t.toJSON()).sort(tagsSorter),
      reinforcement: agent.reinforcement,
      lastReinforcementAnalysisAt:
        agent.lastReinforcementAnalysisAt?.toISOString() ?? null,
      canRead,
      canEdit,
    };

    agentConfigurationTypes.push(agentConfigurationType);
  }

  await shadowAgentPermissions(
    auth,
    agentConfigurations,
    agentConfigurationTypes,
    spaceById
  );

  return agentConfigurationTypes;
}

/**
 * Admins can list every agent of the workspace but the prompt, skills and knowledge of the agents
 * they cannot read (unpublished, or built on spaces they are not a member of) stay private. Tools
 * live in `actions` alongside knowledge, so all actions are dropped for now. `canRead` is set to
 * false so clients can tell the details were redacted. A light fetch is enough as input: the
 * fields that only the full variant carries are the redacted ones.
 */
export function redactPrivateAgentConfigurationFields(
  agent: LightAgentConfigurationType
): AgentConfigurationType {
  return {
    ...agent,
    instructions: null,
    instructionsHtml: null,
    actions: [],
    codeDefinedSkillIds: [],
    canRead: false,
  };
}

// Identifies one agent configuration: an agent id alone spans every version of that agent.
const configurationKey = (
  agent: Pick<LightAgentConfigurationType, "sId" | "version">
): string => `${agent.sId}-${agent.version}`;

/**
 * @cc [owner:fabiencelier,label:security] no-skills-for-redacted-agents
 * An agent whose details were redacted (`canRead === false`) MUST get an empty `skills` array:
 * its skills are private, consistently with `redactPrivateAgentConfigurationFields`.
 */
export async function serializeAgentConfigurationsWithSkills<
  // `codeDefinedSkillIds` is declared on the full configuration schema, but `getGlobalAgents`
  // puts it on global agents in every variant, so light configurations carry it too.
  T extends LightAgentConfigurationType & { codeDefinedSkillIds?: string[] },
>(
  auth: Authenticator,
  agents: T[]
): Promise<AgentConfigurationWithSkillsType<T>[]> {
  const readableAgents = agents.filter((agent) => agent.canRead);

  // Workspace agents hold `AgentSkillModel` rows; global agents declare their skills in code.
  const [globalAgents, workspaceAgents] = partition(readableAgents, (agent) =>
    isGlobalAgentId(agent.sId)
  );

  // Only `sId` and `name` reach the wire, so skip the instructions, tools and file attachments:
  // see the `labels-only-skips-dynamic-instructions` contract.
  const [workspaceAgentSkills, codeDefinedSkills] = await Promise.all([
    SkillResource.listByAgentConfigurations(
      auth,
      workspaceAgents,
      LABELS_ONLY_FETCH_OPTIONS
    ),
    SkillResource.listByCodeDefinedSkillIds(
      auth,
      uniq(globalAgents.flatMap((agent) => agent.codeDefinedSkillIds ?? [])),
      LABELS_ONLY_FETCH_OPTIONS
    ),
  ]);

  // Keyed per configuration, not per agent: an agent has one row per version and callers can
  // pass several of them. `version` is unique within an agent id, and the
  // version is a number, so the two parts cannot run together ambiguously.
  const skillsByConfiguration: Record<string, SkillResource[]> = {};
  for (const { agentConfiguration, skill } of workspaceAgentSkills) {
    (skillsByConfiguration[configurationKey(agentConfiguration)] ??= []).push(
      skill
    );
  }

  const codeDefinedSkillById = new Map(
    codeDefinedSkills.map((skill) => [skill.sId, skill])
  );
  for (const agent of globalAgents) {
    skillsByConfiguration[configurationKey(agent)] = removeNulls(
      (agent.codeDefinedSkillIds ?? []).map(
        (skillId) => codeDefinedSkillById.get(skillId) ?? null
      )
    );
  }

  // `codeDefinedSkillIds` does not reach the wire: the resolved `skills` replace it.
  return agents.map(
    ({ codeDefinedSkillIds: _codeDefinedSkillIds, ...agent }) => ({
      ...agent,
      skills: agent.canRead
        ? (skillsByConfiguration[configurationKey(agent)] ?? []).map((skill) =>
            skill.toAgentSkillJSON()
          )
        : [],
    })
  );
}
