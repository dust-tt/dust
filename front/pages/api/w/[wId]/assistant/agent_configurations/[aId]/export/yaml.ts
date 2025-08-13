import type { NextApiRequest, NextApiResponse } from "next";

import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { AgentYAMLConverter } from "@app/lib/agent_yaml_converter/converter";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetAgentConfigurationYAMLExportResponseBody = {
  yamlContent: string;
  filename: string;
};

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

  // Get the agent configuration
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "full",
  });

  if (!agentConfiguration) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration you requested was not found.",
      },
    });
  }

  // Check permissions
  if (!agentConfiguration.canRead && !auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration you requested was not found.",
      },
    });
  }

  // Only allow export of active, non-global agents
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

  // Function to get MCP server name
  const getMCPServerName = async (mcpServerViewId: string): Promise<string> => {
    try {
      const mcpServerView = await MCPServerViewResource.fetchById(
        auth,
        mcpServerViewId
      );
      if (mcpServerView) {
        const json = mcpServerView.toJSON();
        return json.server.name;
      }
    } catch {
      // Fallback to "unknown"
    }
    return "unknown";
  };

  // Create YAML configuration directly without using fromBuilderFormData
  const yamlConfig = {
    metadata: {
      version: "1.0.0",
      agent_id: agentConfiguration.sId,
      last_modified: new Date(
        agentConfiguration.versionCreatedAt || Date.now()
      ).toISOString(),
      created_by: auth.user()?.sId || "unknown",
    },
    agent: {
      handle: agentConfiguration.name,
      description: agentConfiguration.description,
      scope: agentConfiguration.scope,
      avatar_url: agentConfiguration.pictureUrl || undefined,
      max_steps_per_run: agentConfiguration.maxStepsPerRun,
      visualization_enabled: agentConfiguration.visualizationEnabled,
    },
    instructions: agentConfiguration.instructions || "",
    generation_settings: {
      model_id: agentConfiguration.model.modelId,
      provider_id: agentConfiguration.model.providerId,
      temperature: agentConfiguration.model.temperature,
      reasoning_effort: agentConfiguration.model.reasoningEffort || "none",
      response_format: agentConfiguration.model.responseFormat || undefined,
    },
    tags: agentConfiguration.tags.map((tag) => ({
      name: tag.name,
      kind: tag.kind,
    })),
    editors: (agentConfiguration.editors || []).map((editor) => ({
      user_id: editor.sId,
      email: editor.email,
      full_name: editor.fullName,
    })),
    toolset: await Promise.all([
      // Add MCP actions
      ...agentConfiguration.actions
        .filter((action) => action.type === "mcp_server_configuration")
        .map(async (action) => {
          // Use type guard to safely access server-side properties
          if (!isServerSideMCPServerConfiguration(action)) {
            return {
              id: action.id?.toString() || "",
              name: action.name,
              description: action.description || "",
              type: "MCP" as const,
              configuration: {
                mcp_server_name: "unknown",
                data_sources: undefined,
                time_frame: undefined,
                json_schema: undefined,
              },
            };
          }

          // Get the actual MCP server name
          const mcpServerName = action.mcpServerViewId
            ? await getMCPServerName(action.mcpServerViewId)
            : "unknown";

          return {
            id: action.id?.toString() || "",
            name: action.name,
            description: action.description || "",
            type: "MCP" as const,
            configuration: {
              mcp_server_name: mcpServerName,
              data_sources: undefined,
              time_frame: action.timeFrame || undefined,
              json_schema: action.jsonSchema || undefined,
            },
          };
        }),
      // Add visualization action if enabled
      ...(agentConfiguration.visualizationEnabled
        ? [
            {
              id: "data_visualization",
              name: "Data Visualization",
              description: "Generate charts and visualizations",
              type: "DATA_VISUALIZATION" as const,
              configuration: {},
            },
          ]
        : []),
    ]),
    slack_integration: undefined, // TODO: Add slack integration if available
  };

  const yamlStringResult = AgentYAMLConverter.toYAMLString(yamlConfig);

  if (yamlStringResult.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Error generating YAML string: ${yamlStringResult.error.message}`,
      },
    });
  }

  const sanitizedName = agentConfiguration.name.replace(/[^a-zA-Z0-9-_]/g, "_");
  const filename = `${sanitizedName}_agent.yaml`;

  return res.status(200).json({
    yamlContent: yamlStringResult.value,
    filename,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
