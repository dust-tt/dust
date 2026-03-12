import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";

export function getOpenAIUsageClient(
  extra: ToolHandlerExtra
): Result<OpenAIUsageClient, MCPError> {
  const adminApiKey = extra.authInfo?.token;
  if (!adminApiKey) {
    return new Err(
      new MCPError(
        "OpenAI Admin API key not configured. Please configure the API key in the MCP server settings.",
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

  return new Ok(new OpenAIUsageClient(adminApiKey));
}

export class OpenAIUsageClient {
  private adminApiKey: string;

  constructor(adminApiKey: string) {
    this.adminApiKey = adminApiKey;
  }

  async request(
    endpoint: string,
    params: Record<string, unknown>
  ): Promise<Result<unknown, MCPError>> {
    const url = new URL(`${OPENAI_API_BASE_URL}/${endpoint}`);

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
        Authorization: `Bearer ${this.adminApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 401) {
        return new Err(
          new MCPError(
            "Invalid OpenAI Admin API key. Ensure you're using an admin key (starts with sk-admin-), not a regular API key.",
            {
              tracked: false,
            }
          )
        );
      } else if (response.status === 403) {
        return new Err(
          new MCPError(
            "Insufficient permissions. This endpoint requires an OpenAI Admin API key with usage.read scope.",
            {
              tracked: false,
            }
          )
        );
      } else if (response.status === 429) {
        return new Err(
          new MCPError(
            "OpenAI API rate limit exceeded. Please try again later.",
            {
              tracked: false,
            }
          )
        );
      }
      return new Err(
        new MCPError(`OpenAI API error (${response.status}): ${errorBody}`)
      );
    }

    return new Ok(await response.json());
  }

  async getCompletionsUsage(params: {
    start_time: number;
    end_time?: number;
    bucket_width: string;
    api_key_ids?: string[];
    models?: string[];
    project_ids?: string[];
    user_ids?: string[];
    batch?: boolean;
    group_by?: string[];
    limit: number;
    page?: string;
  }): Promise<Result<unknown, MCPError>> {
    return this.request("organization/usage/completions", params);
  }

  async getOrganizationCosts(params: {
    start_time: number;
    end_time?: number;
    group_by?: string[];
    limit: number;
    page?: string;
    project_ids?: string[];
  }): Promise<Result<unknown, MCPError>> {
    return this.request("organization/costs", params);
  }
}
