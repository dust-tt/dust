import { fetchMCPServerActionConfigurations } from "@app/lib/actions/configuration/mcp";
import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getPublicUploadBucket } from "@app/lib/file_storage";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { tagsSorter } from "@app/lib/utils";
import type {
  AgentConfigurationType,
  AgentFetchVariant,
  AgentModelConfigurationType,
  ModelId,
} from "@app/types";

function getModelForAgentConfiguration(
  agent: AgentConfiguration
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
  const contentType = await getPublicUploadBucket().getFileContentType(
    decodeURIComponent(filename)
  );
  if (!contentType) {
    return false;
  }

  return contentType.includes("image");
}

export async function getAgentSIdFromName(
  auth: Authenticator,
  name: string
): Promise<string | null> {
  const owner = auth.getNonNullableWorkspace();

  const agent = await AgentConfiguration.findOne({
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

/**
 * Enrich agent configurations with additional data (actions, tags, favorites).
 */
export async function enrichAgentConfigurations<V extends AgentFetchVariant>(
  auth: Authenticator,
  agentConfigurations: AgentConfiguration[],
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

  // Compute editor permissions if not provided
  let editorIds = agentIdsForUserAsEditor;
  if (!editorIds) {
    const agentIdsForGroups = user
      ? await GroupResource.findAgentIdsForGroups(auth, [
          ...auth
            .groups()
            .filter((g) => g.kind === "agent_editors")
            .map((g) => g.id),
        ])
      : [];

    editorIds = agentIdsForGroups.map((g) => g.agentConfigurationId);
  }

  const [
    mcpServerActionsConfigurationsPerAgent,
    favoriteStatePerAgent,
    tagsPerAgent,
  ] = await Promise.all([
    fetchMCPServerActionConfigurations(auth, { configurationIds, variant }),
    user && variant !== "extra_light"
      ? getFavoriteStates(auth, { configurationIds: configurationSIds })
      : Promise.resolve(new Map<string, boolean>()),
    variant !== "extra_light"
      ? TagResource.listForAgents(auth, configurationIds)
      : Promise.resolve([]),
  ]);

  const agentConfigurationTypes: AgentConfigurationType[] = [];
  for (const agent of agentConfigurations) {
    const actions =
      variant === "full"
        ? mcpServerActionsConfigurationsPerAgent.get(agent.id) ?? []
        : [];

    const model = getModelForAgentConfiguration(agent);
    const tags: TagResource[] = tagsPerAgent[agent.id] ?? [];

    const isAuthor = agent.authorId === auth.user()?.id;
    const isMember = editorIds.includes(agent.id);

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
      // TODO(2025-10-17 thomas): Remove requestedGroupIds.
      requestedGroupIds: agent.requestedGroupIds.map((groups) =>
        groups.map((id) =>
          GroupResource.modelIdToSId({
            id,
            workspaceId: auth.getNonNullableWorkspace().id,
          })
        )
      ),
      requestedSpaceIds: agent.requestedSpaceIds.map((spaceId) =>
        SpaceResource.modelIdToSId({
          id: spaceId,
          workspaceId: auth.getNonNullableWorkspace().id,
        })
      ),
      tags: tags.map((t) => t.toJSON()).sort(tagsSorter),
      canRead: isAuthor || isMember || agent.scope === "visible",
      canEdit: isAuthor || isMember,
    };

    agentConfigurationTypes.push(agentConfigurationType);
  }

  return agentConfigurationTypes;
}
