import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
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
          "Invalid OpenAI Admin API key. Ensure you're using an admin key (starts with sk-admin-), not a regular API key."
        );
      } else if (response.status === 403) {
        throw new MCPError(
          "Insufficient permissions. This endpoint requires an OpenAI Admin API key with usage.read scope."
        );
      } else if (response.status === 429) {
        throw new MCPError(
          "OpenAI API rate limit exceeded. Please try again later."
        );
      }
      throw new MCPError(`OpenAI API error (${response.status}): ${errorBody}`);
    }

    return response.json();
  };

  server.tool(
    "get_completions_usage",
    "Get OpenAI completions usage data from the Usage API. Returns token usage, model requests, and other metrics.",
    {
      start_time: z
        .number()
        .describe(
          "Start time (Unix seconds) of the query time range, inclusive."
        ),
      end_time: z
        .number()
        .optional()
        .describe(
          "End time (Unix seconds) of the query time range, exclusive."
        ),
      bucket_width: z
        .enum(["1m", "1h", "1d"])
        .default("1m")
        .describe(
          "Width of each time bucket in response. Currently 1m, 1h and 1d are supported, defaults to 1m."
        ),
      api_key_ids: z
        .array(z.string())
        .optional()
        .describe("Return only usage for these API keys."),
      models: z
        .array(z.string())
        .optional()
        .describe("Return only usage for these models."),
      project_ids: z
        .array(z.string())
        .optional()
        .describe("Return only usage for these projects."),
      user_ids: z
        .array(z.string())
        .optional()
        .describe("Return only usage for these users."),
      batch: z
        .boolean()
        .optional()
        .describe(
          "If true, return batch jobs only. If false, return non-batch jobs only. By default, return both."
        ),
      group_by: z
        .array(
          z.enum(["model", "api_key_id", "project_id", "user_id", "batch"])
        )
        .optional()
        .describe(
          "Group the usage data by the specified fields. Support fields include project_id, user_id, api_key_id, model, batch or any combination of them."
        ),
      limit: z
        .number()
        .min(1)
        .max(10000)
        .default(100)
        .describe(
          "Specifies the number of buckets to return. bucket_width=1d: default: 7, max: 31. bucket_width=1h: default: 24, max: 168. bucket_width=1m: default: 60, max: 1440."
        ),
      page: z
        .string()
        .optional()
        .describe(
          "A cursor for use in pagination. Corresponding to the next_page field from the previous response."
        ),
    },
    withToolLogging(
      auth,
      { toolName: "get_completions_usage", agentLoopContext },
      async (params, { authInfo }) => {
        const adminApiKey = authInfo?.token;
        if (!adminApiKey) {
          return new Err(
            new MCPError(
              "OpenAI Admin API key required. Please configure authentication with an admin key."
            )
          );
        }

        try {
          const requestParams = {
            start_time: params.start_time,
            ...(params.end_time && { end_time: params.end_time }),
            bucket_width: params.bucket_width,
            ...(params.api_key_ids && { api_key_ids: params.api_key_ids }),
            ...(params.models && { models: params.models }),
            ...(params.project_ids && { project_ids: params.project_ids }),
            ...(params.user_ids && { user_ids: params.user_ids }),
            ...(params.batch !== undefined && { batch: params.batch }),
            ...(params.group_by && { group_by: params.group_by }),
            limit: params.limit,
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
    {
      start_time: z
        .number()
        .describe(
          "Start time (Unix seconds) of the query time range, inclusive. Required."
        ),
      end_time: z
        .number()
        .optional()
        .describe(
          "End time (Unix seconds) of the query time range, exclusive. Optional."
        ),
      group_by: z
        .array(z.enum(["line_item", "project_id"]))
        .optional()
        .describe(
          "Group the costs by the specified fields. Support fields include project_id, line_item and any combination of them. Optional."
        ),
      limit: z
        .number()
        .min(1)
        .max(180)
        .default(7)
        .describe(
          "A limit on the number of buckets to be returned. Limit can range between 1 and 180, and the default is 7. Optional."
        ),
      page: z
        .string()
        .optional()
        .describe(
          "A cursor for use in pagination. Corresponding to the next_page field from the previous response. Optional."
        ),
      project_ids: z
        .array(z.string())
        .optional()
        .describe("Return only costs for these projects. Optional."),
    },
    withToolLogging(
      auth,
      { toolName: "get_organization_costs", agentLoopContext },
      async (params, { authInfo }) => {
        const adminApiKey = authInfo?.token;
        if (!adminApiKey) {
          return new Err(
            new MCPError(
              "OpenAI Admin API key required. Please configure authentication with an admin key (starts with sk-admin-)."
            )
          );
        }

        if (!adminApiKey.startsWith("sk-admin-")) {
          return new Err(
            new MCPError(
              "This endpoint requires an OpenAI Admin API key (starts with sk-admin-), not a regular API key."
            )
          );
        }

        try {
          const requestParams = {
            start_time: params.start_time,
            ...(params.end_time && { end_time: params.end_time }),
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
};

export default createServer;
