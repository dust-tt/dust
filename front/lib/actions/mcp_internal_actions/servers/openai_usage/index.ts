import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getCompletionsUsageSchema,
  getOrganizationCostsSchema,
  OPENAI_USAGE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/openai_usage/metadata";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import { decrypt, Err, Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("openai_usage");

  const makeOpenAIRequest = async (
    endpoint: string,
    params: Record<string, any>,
    adminApiKey: string
  ): Promise<any> => {
    const url = new URL(`https://api.openai.com/v1/${endpoint}`);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach((v) => url.searchParams.append(key, String(v)));
        } else {
          url.searchParams.append(key, String(value));
        }
      }
    });

    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 401) {
        throw new MCPError(
          "Invalid OpenAI Admin API key. Ensure you're using an admin key (starts with sk-admin-), not a regular API key.",
          {
            tracked: false,
          }
        );
      } else if (response.status === 403) {
        throw new MCPError(
          "Insufficient permissions. This endpoint requires an OpenAI Admin API key with usage.read scope.",
          {
            tracked: false,
          }
        );
      } else if (response.status === 429) {
        throw new MCPError(
          "OpenAI API rate limit exceeded. Please try again later.",
          {
            tracked: false,
          }
        );
      }
      throw new MCPError(`OpenAI API error (${response.status}): ${errorBody}`);
    }

    return response.json();
  };

  server.tool(
    "get_completions_usage",
    "Get OpenAI completions usage data from the Usage API. Returns token usage, model requests, and other metrics.",
    getCompletionsUsageSchema,
    withToolLogging(
      auth,
      { toolNameForMonitoring: OPENAI_USAGE_TOOL_NAME, agentLoopContext },
      async (params) => {
        const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
        if (
          !toolConfig ||
          !isLightServerSideMCPToolConfiguration(toolConfig) ||
          !toolConfig.secretName
        ) {
          return new Err(
            new MCPError(
              "OpenAI Admin API key not configured. Please configure a secret containing an admin key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        const secret = await DustAppSecretModel.findOne({
          where: {
            name: toolConfig.secretName,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
        });

        const adminApiKey = secret
          ? decrypt(secret.hash, auth.getNonNullableWorkspace().sId)
          : null;
        if (!adminApiKey) {
          return new Err(
            new MCPError(
              "OpenAI Admin API key not found in workspace secrets. Please check the secret configuration.",
              {
                tracked: false,
              }
            )
          );
        }

        if (!adminApiKey.startsWith("sk-admin-")) {
          return new Err(
            new MCPError(
              "This endpoint requires an OpenAI Admin API key (starts with sk-admin-), not a regular API key.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          const limitRules = {
            "1d": { default: 7, max: 31 },
            "1h": { default: 24, max: 168 },
            "1m": { default: 60, max: 1440 },
          };

          const rule = limitRules[params.bucket_width];
          const limit = params.limit ?? rule.default;

          if (limit > rule.max) {
            return new Err(
              new MCPError(
                `Limit ${limit} exceeds maximum allowed for bucket_width=${params.bucket_width}. Maximum is ${rule.max}.`,
                {
                  tracked: false,
                }
              )
            );
          }

          // Convert date strings to Unix timestamps
          const startTime = Math.floor(
            new Date(params.start_time).getTime() / 1000
          );
          const endTime = params.end_time
            ? Math.floor(new Date(params.end_time).getTime() / 1000)
            : undefined;

          const requestParams = {
            start_time: startTime,
            ...(endTime && { end_time: endTime }),
            bucket_width: params.bucket_width,
            ...(params.api_key_ids && { api_key_ids: params.api_key_ids }),
            ...(params.models && { models: params.models }),
            ...(params.project_ids && { project_ids: params.project_ids }),
            ...(params.user_ids && { user_ids: params.user_ids }),
            ...(params.batch !== undefined && { batch: params.batch }),
            ...(params.group_by && { group_by: params.group_by }),
            limit: limit,
            ...(params.page && { page: params.page }),
          };

          const data = await makeOpenAIRequest(
            "organization/usage/completions",
            requestParams,
            adminApiKey
          );

          return new Ok([
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ]);
        } catch (error) {
          if (error instanceof MCPError) {
            return new Err(error);
          }
          return new Err(
            new MCPError(
              `Failed to fetch completions usage: ${error instanceof Error ? error.message : "Unknown error"}`
            )
          );
        }
      }
    )
  );

  server.tool(
    "get_organization_costs",
    "Get OpenAI organization cost data from the Costs API. Returns detailed cost breakdown by line items.",
    getOrganizationCostsSchema,
    withToolLogging(
      auth,
      { toolNameForMonitoring: OPENAI_USAGE_TOOL_NAME, agentLoopContext },
      async (params) => {
        const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
        if (
          !toolConfig ||
          !isLightServerSideMCPToolConfiguration(toolConfig) ||
          !toolConfig.secretName
        ) {
          return new Err(
            new MCPError(
              "OpenAI Admin API key not configured. Please configure a secret containing an admin key in the agent settings.",
              {
                tracked: false,
              }
            )
          );
        }

        const secret = await DustAppSecretModel.findOne({
          where: {
            name: toolConfig.secretName,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
        });

        const adminApiKey = secret
          ? decrypt(secret.hash, auth.getNonNullableWorkspace().sId)
          : null;
        if (!adminApiKey) {
          return new Err(
            new MCPError(
              "OpenAI Admin API key not found in workspace secrets. Please check the secret configuration.",
              {
                tracked: false,
              }
            )
          );
        }

        if (!adminApiKey.startsWith("sk-admin-")) {
          return new Err(
            new MCPError(
              "This endpoint requires an OpenAI Admin API key (starts with sk-admin-), not a regular API key.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          // Convert date strings to Unix timestamps
          const startTime = Math.floor(
            new Date(params.start_time).getTime() / 1000
          );
          const endTime = params.end_time
            ? Math.floor(new Date(params.end_time).getTime() / 1000)
            : undefined;

          const requestParams = {
            start_time: startTime,
            ...(endTime && { end_time: endTime }),
            ...(params.group_by && { group_by: params.group_by }),
            limit: params.limit,
            ...(params.page && { page: params.page }),
            ...(params.project_ids && { project_ids: params.project_ids }),
          };

          const data = await makeOpenAIRequest(
            "organization/costs",
            requestParams,
            adminApiKey
          );

          return new Ok([
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ]);
        } catch (error) {
          if (error instanceof MCPError) {
            return new Err(error);
          }
          return new Err(
            new MCPError(
              `Failed to fetch organization costs: ${error instanceof Error ? error.message : "Unknown error"}`
            )
          );
        }
      }
    )
  );

  return server;
}

export default createServer;
