import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { AgentYAMLConverter } from "@app/lib/agent_yaml_converter/converter";
import type { AgentYAMLConfig } from "@app/lib/agent_yaml_converter/schemas";
import {
  agentYAMLBasicInfoSchema,
  agentYAMLConfigSchema,
  agentYAMLGenerationSettingsSchema,
} from "@app/lib/agent_yaml_converter/schemas";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import {
  type ExportableAgentConfiguration,
  getAgentConfigurationForExport,
} from "@app/lib/api/assistant/configuration/yaml_export";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { PostOrPatchAgentConfigurationRequestBody } from "@app/types/api/internal/agent_configuration";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

interface SkippedAction {
  name: string;
  reason: string;
}

type ImportResult = Result<
  {
    agentConfiguration: AgentConfigurationType;
    skippedActions: SkippedAction[];
  },
  APIErrorWithStatusCode
>;

type AssistantRequestBody =
  PostOrPatchAgentConfigurationRequestBody["assistant"];

const agentYAMLConfigPatchSchema = agentYAMLConfigSchema.partial().extend({
  agent: agentYAMLBasicInfoSchema.partial().optional(),
  generation_settings: agentYAMLGenerationSettingsSchema.partial().optional(),
});

interface ResolvedEditors {
  editors: AssistantRequestBody["editors"];
  authorId: ModelId;
}

async function resolveYAMLActions(
  auth: Authenticator,
  toolset: AgentYAMLConfig["toolset"]
): Promise<
  Result<
    {
      actions: AssistantRequestBody["actions"];
      skippedActions: SkippedAction[];
    },
    APIErrorWithStatusCode
  >
> {
  const result = await AgentYAMLConverter.convertYAMLToolsetToAssistantActions(
    auth,
    toolset
  );

  if (result.isErr()) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Error converting YAML actions: ${result.error.message}`,
      },
    });
  }

  return new Ok(result.value);
}

function resolveEditorUsers(
  auth: Authenticator,
  editorUsers: UserResource[]
): Result<ResolvedEditors, APIErrorWithStatusCode> {
  const uploadingUser = auth.user();
  const resolvedEditorUsers =
    uploadingUser && !editorUsers.some((u) => u.id === uploadingUser.id)
      ? [...editorUsers, uploadingUser]
      : editorUsers;

  if (resolvedEditorUsers.length === 0) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "At least one editor is required.",
      },
    });
  }

  return new Ok({
    editors: resolvedEditorUsers.map((user) => ({
      sId: user.sId,
    })),
    authorId: resolvedEditorUsers[0].id,
  });
}

async function resolveEditorUsersFromEmails(
  auth: Authenticator,
  editorEmails: string[]
): Promise<Result<ResolvedEditors, APIErrorWithStatusCode>> {
  const fetchedEditors = await UserResource.listUserWithExactEmails(
    auth.getNonNullableWorkspace(),
    editorEmails
  );

  return resolveEditorUsers(auth, fetchedEditors);
}

async function resolveEditorUsersFromAgentConfiguration(
  auth: Authenticator,
  agentConfiguration: ExportableAgentConfiguration
): Promise<Result<ResolvedEditors, APIErrorWithStatusCode>> {
  const editorsResult = await GroupResource.findEditorGroupForAgent(
    auth,
    agentConfiguration
  );
  if (editorsResult.isErr()) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Unable to resolve existing agent editors: ${editorsResult.error.message}`,
      },
    });
  }

  return resolveEditorUsers(
    auth,
    await editorsResult.value.getActiveMembers(auth)
  );
}

async function resolveTags(
  auth: Authenticator,
  yamlTags: AgentYAMLConfig["tags"]
): Promise<Result<AssistantRequestBody["tags"], APIErrorWithStatusCode>> {
  const tagNames = yamlTags.map((t) => t.name);
  const resolvedTags = await TagResource.findByNames(auth, tagNames);
  const resolvedTagNames = new Set(resolvedTags.map((t) => t.name));
  const missingTags = tagNames.filter((name) => !resolvedTagNames.has(name));

  if (missingTags.length > 0) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Tags not found: ${missingTags.map((t) => `"${t}"`).join(", ")}.`,
      },
    });
  }

  return new Ok(resolvedTags.map((t) => t.toJSON()));
}

async function ensureAgentConfigurationSavingEnabled(): Promise<
  Result<void, APIErrorWithStatusCode>
> {
  const isSaveAgentConfigurationsDisabled =
    await KillSwitchResource.isKillSwitchEnabled("save_agent_configurations");
  if (isSaveAgentConfigurationsDisabled) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "app_auth_error",
        message:
          "Saving agent configurations is temporarily disabled, try again later.",
      },
    });
  }

  return new Ok(undefined);
}

async function saveAgentConfigurationFromAssistant({
  auth,
  assistant,
  skippedActions,
  authorId,
  agentConfigurationId,
}: {
  auth: Authenticator;
  assistant: AssistantRequestBody;
  skippedActions: SkippedAction[];
  authorId: ModelId;
  agentConfigurationId?: string;
}): Promise<ImportResult> {
  const agentConfigurationRes = await createOrUpgradeAgentConfiguration({
    auth,
    assistant,
    agentConfigurationId,
    authorId,
  });

  if (agentConfigurationRes.isErr()) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "assistant_saving_error",
        message: `Error creating agent: ${agentConfigurationRes.error.message}`,
      },
    });
  }

  return new Ok({
    agentConfiguration: agentConfigurationRes.value,
    skippedActions,
  });
}

async function importAgentConfiguration(
  auth: Authenticator,
  yamlConfig: AgentYAMLConfig,
  agentConfigurationId?: string
): Promise<ImportResult> {
  const saveEnabledResult = await ensureAgentConfigurationSavingEnabled();
  if (saveEnabledResult.isErr()) {
    return saveEnabledResult;
  }

  const actionsResult = await resolveYAMLActions(auth, yamlConfig.toolset);
  if (actionsResult.isErr()) {
    return actionsResult;
  }

  const editorsResult = await resolveEditorUsersFromEmails(
    auth,
    yamlConfig.editors
  );
  if (editorsResult.isErr()) {
    return editorsResult;
  }

  const tagsResult = await resolveTags(auth, yamlConfig.tags);
  if (tagsResult.isErr()) {
    return tagsResult;
  }

  return saveAgentConfigurationFromAssistant({
    auth,
    assistant: {
      name: yamlConfig.agent.handle,
      description: yamlConfig.agent.description,
      instructions: yamlConfig.instructions,
      pictureUrl: yamlConfig.agent.avatar_url ?? "",
      status: "active",
      scope: yamlConfig.agent.scope,
      model: {
        modelId: yamlConfig.generation_settings.model_id,
        providerId: yamlConfig.generation_settings.provider_id,
        temperature: yamlConfig.generation_settings.temperature,
        reasoningEffort: yamlConfig.generation_settings.reasoning_effort,
        responseFormat: yamlConfig.generation_settings.response_format,
      },
      actions: actionsResult.value.actions,
      templateId: null,
      tags: tagsResult.value,
      editors: editorsResult.value.editors,
      skills: (yamlConfig.skills ?? []).map((skill) => ({
        sId: skill.sId,
      })),
      additionalRequestedSpaceIds: [],
    },
    skippedActions: actionsResult.value.skippedActions,
    authorId: editorsResult.value.authorId,
    agentConfigurationId,
  });
}

export async function importAgentConfigurationFromYAMLString(
  auth: Authenticator,
  yamlContent: string
): Promise<ImportResult> {
  const yamlConfigResult = AgentYAMLConverter.fromYAMLString(yamlContent);
  if (yamlConfigResult.isErr()) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid YAML format: ${yamlConfigResult.error.message}`,
      },
    });
  }

  return importAgentConfiguration(auth, yamlConfigResult.value);
}

export async function importAgentConfigurationFromJSON(
  auth: Authenticator,
  body: unknown
): Promise<ImportResult> {
  const parsed = agentYAMLConfigSchema.safeParse(body);
  if (!parsed.success) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid agent configuration: ${parsed.error.message}`,
      },
    });
  }

  return importAgentConfiguration(auth, parsed.data);
}

export async function patchAgentConfigurationFromJSON(
  auth: Authenticator,
  agentId: string,
  body: unknown
): Promise<ImportResult> {
  const parsed = agentYAMLConfigPatchSchema.safeParse(body);
  if (!parsed.success) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid patch body: ${parsed.error.message}`,
      },
    });
  }

  const saveEnabledResult = await ensureAgentConfigurationSavingEnabled();
  if (saveEnabledResult.isErr()) {
    return saveEnabledResult;
  }

  const agentResult = await getAgentConfigurationForExport(auth, agentId);
  if (agentResult.isErr()) {
    return agentResult;
  }

  const agentConfiguration = agentResult.value;
  const actions: AssistantRequestBody["actions"] = agentConfiguration.actions
    .filter(isServerSideMCPServerConfiguration);

  const editorsResult = await resolveEditorUsersFromAgentConfiguration(
    auth,
    agentConfiguration
  );
  if (editorsResult.isErr()) {
    return editorsResult;
  }

  const skills = await SkillResource.listByAgentConfiguration(
    auth,
    agentConfiguration
  );
  const patch = parsed.data;
  const assistant: AssistantRequestBody = {
    name: agentConfiguration.name,
    description: agentConfiguration.description,
    instructions: agentConfiguration.instructions,
    instructionsHtml: agentConfiguration.instructionsHtml,
    pictureUrl: agentConfiguration.pictureUrl,
    status: agentConfiguration.status,
    scope: agentConfiguration.scope,
    model: agentConfiguration.model,
    actions,
    templateId: agentConfiguration.templateId,
    tags: agentConfiguration.tags,
    editors: editorsResult.value.editors,
    skills: skills.map((skill) => ({
      sId: skill.sId,
    })),
    additionalRequestedSpaceIds: agentConfiguration.requestedSpaceIds,
  };
  let authorId = editorsResult.value.authorId;
  let skippedActions: SkippedAction[] = [];

  if (patch.agent) {
    if (patch.agent.handle !== undefined) {
      assistant.name = patch.agent.handle;
    }
    if (patch.agent.description !== undefined) {
      assistant.description = patch.agent.description;
    }
    if (patch.agent.avatar_url !== undefined) {
      assistant.pictureUrl = patch.agent.avatar_url;
    }
    if (patch.agent.scope !== undefined) {
      assistant.scope = patch.agent.scope;
    }
  }

  if (patch.instructions !== undefined) {
    assistant.instructions = patch.instructions;
    assistant.instructionsHtml = null;
  }

  const {
    model_id = assistant.model.modelId,
    provider_id = assistant.model.providerId,
    reasoning_effort = assistant.model.reasoningEffort,
    response_format = assistant.model.responseFormat,
    temperature = assistant.model.temperature,
  } = patch.generation_settings ?? {};
  assistant.model = {
    ...assistant.model,
    modelId: model_id,
    providerId: provider_id,
    temperature,
    reasoningEffort: reasoning_effort,
    responseFormat: response_format,
  };

  if (patch.tags !== undefined) {
    const tagsResult = await resolveTags(auth, patch.tags);
    if (tagsResult.isErr()) {
      return tagsResult;
    }
    assistant.tags = tagsResult.value;
  }

  if (patch.editors !== undefined) {
    const patchEditorsResult = await resolveEditorUsersFromEmails(
      auth,
      patch.editors
    );
    if (patchEditorsResult.isErr()) {
      return patchEditorsResult;
    }
    assistant.editors = patchEditorsResult.value.editors;
    authorId = patchEditorsResult.value.authorId;
  }

  if (patch.toolset !== undefined) {
    const patchActionsResult = await resolveYAMLActions(auth, patch.toolset);
    if (patchActionsResult.isErr()) {
      return patchActionsResult;
    }
    assistant.actions = patchActionsResult.value.actions;
    skippedActions = patchActionsResult.value.skippedActions;
  }

  if (patch.skills !== undefined) {
    assistant.skills = patch.skills.map((skill) => ({
      sId: skill.sId,
    }));
  }

  if (
    patch.spaces !== undefined ||
    patch.toolset !== undefined ||
    patch.skills !== undefined
  ) {
    assistant.additionalRequestedSpaceIds =
      patch.spaces?.map((space) => space.space_id) ?? [];
  }

  return saveAgentConfigurationFromAssistant({
    auth,
    assistant,
    skippedActions,
    authorId,
    agentConfigurationId: agentId,
  });
}
