import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { AgentYAMLConverter } from "@app/lib/agent_yaml_converter/converter";
import type {
  AgentYAMLAction,
  AgentYAMLConfig,
} from "@app/lib/agent_yaml_converter/schemas";
import {
  agentYAMLBasicInfoSchema,
  agentYAMLConfigSchema,
  agentYAMLGenerationSettingsSchema,
} from "@app/lib/agent_yaml_converter/schemas";
import {
  convertAgentConfigurationToYAMLConfig,
  getAgentConfigurationForExport,
} from "@app/lib/api/assistant/configuration/yaml_export";
import type { Authenticator } from "@app/lib/auth";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { createOrUpgradeAgentConfiguration } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import type { PostOrPatchAgentConfigurationRequestBody } from "@app/types/api/internal/agent_configuration";
import { MCPServerActionConfigurationSchema } from "@app/types/api/internal/agent_configuration";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { APIErrorWithStatusCode } from "@app/types/error";
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

interface ResolvedActions {
  configurations: PostOrPatchAgentConfigurationRequestBody["assistant"]["actions"];
  skipped: { action: { name?: string }; reason: string }[];
}

type ActionSource =
  | { type: "yaml"; toolset: AgentYAMLAction[] }
  | { type: "config"; actions: AgentConfigurationType["actions"] };

async function resolveActions(
  auth: Authenticator,
  source: ActionSource
): Promise<Result<ResolvedActions, APIErrorWithStatusCode>> {
  if (source.type === "config") {
    const serverSideActions = source.actions.filter(
      isServerSideMCPServerConfiguration
    );

    // Strip fields that exist on ServerSideMCPServerConfigurationType but not
    // on the request body schema (MCPServerActionConfigurationSchema).
    const configurations = [];
    for (const action of serverSideActions) {
      const parsed = MCPServerActionConfigurationSchema.safeParse(action);
      if (!parsed.success) {
        return new Err({
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid existing action configuration: ${parsed.error.message}`,
          },
        });
      }
      configurations.push(parsed.data);
    }

    return new Ok({
      configurations,
      skipped: [],
    });
  }

  const result = await AgentYAMLConverter.convertYAMLActionsToMCPConfigurations(
    auth,
    source.toolset
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

async function importAgentConfiguration(
  auth: Authenticator,
  yamlConfig: AgentYAMLConfig,
  actionSource: ActionSource,
  agentConfigurationId?: string
): Promise<ImportResult> {
  const isSaveAgentConfigurationsEnabled =
    await KillSwitchResource.isKillSwitchEnabled("save_agent_configurations");
  if (isSaveAgentConfigurationsEnabled) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "app_auth_error",
        message:
          "Saving agent configurations is temporarily disabled, try again later.",
      },
    });
  }

  const actionsResult = await resolveActions(auth, actionSource);
  if (actionsResult.isErr()) {
    return actionsResult;
  }

  const editorEmails = yamlConfig.editors;
  const fetchedEditors = await UserResource.listUserWithExactEmails(
    auth.getNonNullableWorkspace(),
    editorEmails
  );

  const uploadingUser = auth.user();
  const editorUsers =
    uploadingUser && !fetchedEditors.some((u) => u.id === uploadingUser.id)
      ? [...fetchedEditors, uploadingUser]
      : fetchedEditors;

  if (editorUsers.length === 0) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "At least one editor is required.",
      },
    });
  }

  const authorModelId = editorUsers[0].id;

  const { configurations: mcpConfigurations, skipped: skippedActions } =
    actionsResult.value;

  const tagNames = yamlConfig.tags.map((t) => t.name);
  const resolvedTags = await TagResource.findByNames(auth, tagNames);
  const missingTags = tagNames.filter(
    (name) => !resolvedTags.some((t) => t.name === name)
  );

  if (missingTags.length > 0) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Tags not found: ${missingTags.map((t) => `"${t}"`).join(", ")}.`,
      },
    });
  }

  const assistant = {
    name: yamlConfig.agent.handle,
    description: yamlConfig.agent.description,
    instructions: yamlConfig.instructions,
    pictureUrl: yamlConfig.agent.avatar_url ?? "",
    status: "active" as const,
    scope: yamlConfig.agent.scope,
    model: {
      modelId: yamlConfig.generation_settings.model_id,
      providerId: yamlConfig.generation_settings.provider_id,
      temperature: yamlConfig.generation_settings.temperature,
      reasoningEffort: yamlConfig.generation_settings.reasoning_effort,
      responseFormat: yamlConfig.generation_settings.response_format,
    },
    maxStepsPerRun: yamlConfig.agent.max_steps_per_run,
    actions: mcpConfigurations,
    templateId: null,
    tags: resolvedTags.map((t) => t.toJSON()),
    editors: editorUsers.map((user) => ({
      sId: user.sId,
    })),
    skills: (yamlConfig.skills ?? []).map((skill) => ({
      sId: skill.sId,
    })),
    additionalRequestedSpaceIds: [],
  };

  const agentConfigurationRes = await createOrUpgradeAgentConfiguration({
    auth,
    assistant,
    agentConfigurationId,
    authorId: authorModelId,
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
    skippedActions: skippedActions.map(({ action, reason }) => ({
      name: action.name ?? "",
      reason,
    })),
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

  const yamlConfig = yamlConfigResult.value;

  return importAgentConfiguration(auth, yamlConfig, {
    type: "yaml",
    toolset: yamlConfig.toolset,
  });
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

  const yamlConfig = parsed.data;

  return importAgentConfiguration(auth, yamlConfig, {
    type: "yaml",
    toolset: yamlConfig.toolset,
  });
}

const agentYAMLConfigPatchSchema = agentYAMLConfigSchema.partial().extend({
  agent: agentYAMLBasicInfoSchema.partial().optional(),
  generation_settings: agentYAMLGenerationSettingsSchema.partial().optional(),
});

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

  const patch = parsed.data;

  const agentResult = await getAgentConfigurationForExport(auth, agentId);
  if (agentResult.isErr()) {
    return agentResult;
  }

  const agentConfiguration = agentResult.value;

  const yamlConfigResult = await convertAgentConfigurationToYAMLConfig(
    auth,
    agentConfiguration
  );
  if (yamlConfigResult.isErr()) {
    return yamlConfigResult;
  }

  const existing = yamlConfigResult.value;

  const mergedYamlConfig: AgentYAMLConfig = {
    ...existing,
    ...patch,
    agent: { ...existing.agent, ...patch.agent },
    generation_settings: {
      ...existing.generation_settings,
      ...patch.generation_settings,
    },
  };

  // When the patch does not include toolset, preserve the existing actions
  // directly from the agent config to avoid the YAML round-trip.
  const actionSource: ActionSource = patch.toolset
    ? { type: "yaml", toolset: mergedYamlConfig.toolset }
    : { type: "config", actions: agentConfiguration.actions };

  return importAgentConfiguration(
    auth,
    mergedYamlConfig,
    actionSource,
    agentId
  );
}
