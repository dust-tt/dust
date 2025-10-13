import type { NextApiRequest, NextApiResponse } from "next";

import {
  convertActionsForFormData,
  transformAgentConfigurationToFormData,
} from "@app/components/agent_builder/transformAgentConfiguration";
import {
  buildInitialActions,
  getAccessibleSourcesAndAppsForActions,
} from "@app/components/assistant_builder/server_side_props_helpers";
import { AgentYAMLConverter } from "@app/lib/agent_yaml_converter/converter";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetAgentConfigurationYAMLExportResponseBody = {
  yamlContent: string;
  filename: string;
};

const AGENT_NAME_SANITATION_REGEX: RegExp = /[^a-zA-Z0-9-_]/g;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetAgentConfigurationYAMLExportResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { aId } = req.query;
  if (typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "full",
  });

  if (!agentConfiguration || (!agentConfiguration.canRead && !auth.isAdmin())) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration you requested was not found.",
      },
    });
  }

  if (
    agentConfiguration.status !== "active" ||
    agentConfiguration.scope === "global"
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Cannot export archived or global agents.",
      },
    });
  }

  const { dataSourceViews, mcpServerViews } =
    await getAccessibleSourcesAndAppsForActions(auth);
  const mcpServerViewsJSON = mcpServerViews.map((v) => v.toJSON());

  const actions = await buildInitialActions({
    dataSourceViews,
    configuration: agentConfiguration,
    mcpServerViews: mcpServerViewsJSON,
  });

  const baseFormData =
    transformAgentConfigurationToFormData(agentConfiguration);
  const formData = {
    ...baseFormData,
    actions: convertActionsForFormData(actions),
  };

  const yamlConfigResult = await AgentYAMLConverter.fromBuilderFormData(
    auth,
    formData
  );

  if (yamlConfigResult.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Error converting agent configuration: ${yamlConfigResult.error.message}`,
      },
    });
  }

  const yamlStringResult = AgentYAMLConverter.toYAMLString(
    yamlConfigResult.value
  );

  if (yamlStringResult.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Error generating YAML string: ${yamlStringResult.error.message}`,
      },
    });
  }

  const sanitizedName = agentConfiguration.name.replace(
    AGENT_NAME_SANITATION_REGEX,
    "_"
  );
  const filename = `${sanitizedName}_agent.yaml`;

  return res.status(200).json({
    yamlContent: yamlStringResult.value,
    filename,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
