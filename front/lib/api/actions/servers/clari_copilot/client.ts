import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type {
  ClariCall,
  ClariCallDetails,
} from "@app/lib/api/actions/servers/clari_copilot/types";
import {
  ClariCallDetailsResponseSchema,
  ClariCallsResponseSchema,
} from "@app/lib/api/actions/servers/clari_copilot/types";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const CLARI_COPILOT_BASE_URL = "https://rest-api.copilot.clari.com";

export interface SearchCallsParams {
  from_date?: string;
  to_date?: string;
  account_name?: string;
  user_email?: string;
  limit?: number;
}

export function getClariClient(
  extra: ToolHandlerExtra
): Result<ClariCopilotClient, MCPError> {
  const customHeaders = extra.authInfo?.extra?.customHeaders as
    | Record<string, string>
    | undefined;
  const apiKey = customHeaders?.["X-Api-Key"];
  const apiPassword = customHeaders?.["X-Api-Password"];

  if (!apiKey || !apiPassword) {
    return new Err(
      new MCPError(
        "Clari Copilot credentials not configured. " +
          "Add X-Api-Key and X-Api-Password as custom headers in the MCP server settings.",
        { tracked: false }
      )
    );
  }

  return new Ok(new ClariCopilotClient(apiKey, apiPassword));
}

export class ClariCopilotClient {
  private apiKey: string;
  private apiPassword: string;

  constructor(apiKey: string, apiPassword: string) {
    this.apiKey = apiKey;
    this.apiPassword = apiPassword;
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      "X-Api-Key": this.apiKey,
      "X-Api-Password": this.apiPassword,
    };
  }

  async searchCalls(
    params: SearchCallsParams
  ): Promise<Result<ClariCall[], Error>> {
    const query = new URLSearchParams({
      filterStatus: "POST_PROCESSING_DONE",
      includePrivate: "false",
      includePagination: "false",
      limit: String(Math.min(params.limit ?? 25, 100)),
    });

    if (params.from_date) {
      query.set("filterTimeGt", params.from_date);
    }
    if (params.to_date) {
      query.set("filterTimeLt", params.to_date);
    }
    if (params.user_email) {
      query.set("filterUser", params.user_email);
    }

    try {
      const response = await untrustedFetch(
        `${CLARI_COPILOT_BASE_URL}/calls?${query.toString()}`,
        { headers: this.getAuthHeaders() }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return new Err(
          new Error(
            `Clari API error (${response.status}): ${errorText || response.statusText}`
          )
        );
      }

      const rawData = await response.json();
      const parseResult = ClariCallsResponseSchema.safeParse(rawData);

      if (!parseResult.success) {
        logger.error(
          { error: parseResult.error.message },
          "[ClariCopilot] Invalid /calls response format"
        );
        return new Err(
          new Error(`Invalid Clari API response: ${parseResult.error.message}`)
        );
      }

      let calls = parseResult.data.calls;

      // account_name filter is client-side — no server-side filter exists.
      if (params.account_name) {
        const needle = params.account_name.toLowerCase();
        calls = calls.filter((c) =>
          c.account_name?.toLowerCase().includes(needle)
        );
      }

      return new Ok(calls);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  async getCallDetails(
    callId: string
  ): Promise<Result<ClariCallDetails, Error>> {
    try {
      const response = await untrustedFetch(
        `${CLARI_COPILOT_BASE_URL}/call-details?id=${encodeURIComponent(callId)}`,
        { headers: this.getAuthHeaders() }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return new Err(new Error(`Call not found: ${callId}`));
        }
        const errorText = await response.text();
        return new Err(
          new Error(
            `Clari API error (${response.status}): ${errorText || response.statusText}`
          )
        );
      }

      const rawData = await response.json();
      const parseResult = ClariCallDetailsResponseSchema.safeParse(rawData);

      if (!parseResult.success) {
        logger.error(
          { callId, error: parseResult.error.message },
          "[ClariCopilot] Invalid /call-details response format"
        );
        return new Err(
          new Error(`Invalid Clari API response: ${parseResult.error.message}`)
        );
      }

      return new Ok(parseResult.data.call);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }
}
