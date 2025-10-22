import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import uniqueId from "lodash/uniqueId";
import type { NextApiRequest, NextApiResponse } from "next";

import { AgentYAMLConverter } from "@app/lib/agent_yaml_converter/converter";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { apiError } from "@app/logger/withlogging";
import { createOrUpgradeAgentConfiguration } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import type { AgentConfigurationType, WithAPIErrorResponse } from "@app/types";

const PostAgentConfigurationFromYAMLRequestBodySchema = t.type({
  yamlContent: t.string,
});

export type PostAgentConfigurationFromYAMLRequestBody = t.TypeOf<
  typeof PostAgentConfigurationFromYAMLRequestBodySchema
>;

export type PostAgentConfigurationFromYAMLResponseBody = {
  agentConfiguration: AgentConfigurationType;
  skippedActions?: { name: string; reason: string }[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostAgentConfigurationFromYAMLResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  // Check kill switches
  const killSwitches = await KillSwitchResource.listEnabledKillSwitches();
  if (killSwitches?.includes("save_agent_configurations")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "app_auth_error",
        message:
          "Saving agent configurations is temporarily disabled, try again later.",
      },
    });
  }

  const bodyValidation = PostAgentConfigurationFromYAMLRequestBodySchema.decode(
    req.body
  );
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const { yamlContent } = bodyValidation.right;

  const yamlConfigResult = AgentYAMLConverter.fromYAMLString(yamlContent);
  if (yamlConfigResult.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid YAML format: ${yamlConfigResult.error.message}`,
      },
    });
  }

  const yamlConfig = yamlConfigResult.value;

  const mcpConfigurationsResult =
    await AgentYAMLConverter.convertYAMLActionsToMCPConfigurations(
      auth,
      yamlConfig.toolset
    );

  if (mcpConfigurationsResult.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Error converting YAML actions: ${mcpConfigurationsResult.error.message}`,
      },
    });
  }

  const { configurations: mcpConfigurations, skipped: skippedActions } =
    mcpConfigurationsResult.value;

  const agent = {
    name: yamlConfig.agent.handle,
    description: yamlConfig.agent.description,
    instructions: yamlConfig.instructions,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    pictureUrl: yamlConfig.agent.avatar_url || "",
    status: "active" as const,
    scope: yamlConfig.agent.scope,
    model: {
      modelId: yamlConfig.generation_settings.model_id,
      providerId: yamlConfig.generation_settings.provider_id,
      temperature: yamlConfig.generation_settings.temperature,
      reasoningEffort: yamlConfig.generation_settings.reasoning_effort,
      responseFormat:
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        yamlConfig.generation_settings.response_format || undefined,
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
  };

  const agentConfigurationRes = await createOrUpgradeAgentConfiguration({
    auth,
    assistant: agent,
  });

  if (agentConfigurationRes.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "assistant_saving_error",
        message: `Error creating agent: ${agentConfigurationRes.error.message}`,
      },
    });
  }

  return res.status(200).json({
    agentConfiguration: agentConfigurationRes.value,
    skippedActions: skippedActions.map(({ action, reason }) => ({
      name: action.name,
      reason,
    })),
  });
}

export default withSessionAuthenticationForWorkspace(handler);
