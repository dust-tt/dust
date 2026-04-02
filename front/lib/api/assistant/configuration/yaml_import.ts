import { AgentYAMLConverter } from "@app/lib/agent_yaml_converter/converter";
import type { AgentYAMLConfig } from "@app/lib/agent_yaml_converter/schemas";
import {
  agentYAMLBasicInfoSchema,
  agentYAMLConfigSchema,
  agentYAMLGenerationSettingsSchema,
} from "@app/lib/agent_yaml_converter/schemas";
import { getAgentConfigurationAsYAMLConfig } from "@app/lib/api/assistant/configuration/yaml_export";
import type { Authenticator } from "@app/lib/auth";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { createOrUpgradeAgentConfiguration } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import uniqueId from "lodash/uniqueId";

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

async function importAgentConfiguration(
  auth: Authenticator,
  yamlConfig: AgentYAMLConfig,
  agentConfigurationId?: string
): Promise<ImportResult> {
  const isSaveAgentConfigurationsEnabled =
    await KillSwitchResource.isKillSwitchEnabledCached(
      "save_agent_configurations"
    );
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

  const editorIds = yamlConfig.editors.map((e) => e.user_id);
  if (editorIds.length === 0) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "At least one editor is required.",
      },
    });
  }

  const editorUsers = await UserResource.fetchByIds(editorIds);
  if (editorUsers.length === 0) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No valid editor users found.",
      },
    });
  }

  const authorModelId = editorUsers[0].id;

  const mcpConfigurationsResult =
    await AgentYAMLConverter.convertYAMLActionsToMCPConfigurations(
      auth,
      yamlConfig.toolset
    );

  if (mcpConfigurationsResult.isErr()) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Error converting YAML actions: ${mcpConfigurationsResult.error.message}`,
      },
    });
  }

  const { configurations: mcpConfigurations, skipped: skippedActions } =
    mcpConfigurationsResult.value;

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
    tags: yamlConfig.tags.map((tag) => ({
      sId: uniqueId(),
      name: tag.name,
      kind: tag.kind,
    })),
    editors: yamlConfig.editors.map((editor) => ({
      sId: editor.user_id,
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
      name: action.name,
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

  const existingResult = await getAgentConfigurationAsYAMLConfig(auth, agentId);
  if (existingResult.isErr()) {
    return existingResult;
  }

  const existing = existingResult.value;

  const merged: AgentYAMLConfig = {
    ...existing,
    ...patch,
    agent: { ...existing.agent, ...patch.agent },
    generation_settings: {
      ...existing.generation_settings,
      ...patch.generation_settings,
    },
  };

  return importAgentConfiguration(auth, merged, agentId);
}
