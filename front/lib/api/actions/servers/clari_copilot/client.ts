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
import { isString } from "@app/types/shared/utils/general";
import type { z } from "zod";

const CLARI_COPILOT_BASE_URL = "https://rest-api.copilot.clari.com";
const CLARI_DEFAULT_LIMIT = 25;
const CLARI_PROCESSED_STATUS = "POST_PROCESSING_DONE";

export class ClariCallNotFoundError extends Error {
  constructor(callId: string) {
    super(`Call not found: ${callId}`);
    this.name = "ClariCallNotFoundError";
  }
}

class ClariHttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "ClariHttpError";
  }
}

export interface SearchCallsParams {
  from_date?: string;
  to_date?: string;
  account_name?: string;
  user_email?: string;
  attendee_email?: string;
  limit?: number;
}

export function getClariClient(
  extra: ToolHandlerExtra
): Result<ClariCopilotClient, MCPError> {
  const rawHeaders = extra.authInfo?.extra?.customHeaders;
  const headers =
    typeof rawHeaders === "object" &&
    rawHeaders !== null &&
    !Array.isArray(rawHeaders)
      ? (rawHeaders as Record<string, unknown>)
      : undefined;
  const apiKey = headers?.["X-Api-Key"];
  const apiPassword = headers?.["X-Api-Password"];

  if (!isString(apiKey) || !isString(apiPassword)) {
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

  private async get<T extends z.ZodTypeAny>(
    path: string,
    schema: T
  ): Promise<Result<z.infer<T>, Error>> {
    try {
      const response = await untrustedFetch(
        `${CLARI_COPILOT_BASE_URL}${path}`,
        {
          headers: this.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return new Err(
          new ClariHttpError(
            response.status,
            `Clari API error (${response.status}): ${errorText || response.statusText}`
          )
        );
      }

      const rawData = await response.json();
      const parseResult = schema.safeParse(rawData);

      if (!parseResult.success) {
        logger.error(
          { path, error: parseResult.error.message },
          "[ClariCopilot] Invalid response format"
        );
        return new Err(
          new Error(`Invalid Clari API response: ${parseResult.error.message}`)
        );
      }

      return new Ok(parseResult.data);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  async searchCalls(
    params: SearchCallsParams
  ): Promise<Result<ClariCall[], Error>> {
    const query = new URLSearchParams({
      filterStatus: CLARI_PROCESSED_STATUS,
      includePrivate: "false",
      includePagination: "false",
      limit: String(params.limit ?? CLARI_DEFAULT_LIMIT),
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
    if (params.attendee_email) {
      query.set("filterAttendees", params.attendee_email);
    }

    const result = await this.get(
      `/calls?${query.toString()}`,
      ClariCallsResponseSchema
    );
    if (result.isErr()) {
      return result;
    }

    let calls = result.value.calls;

    // account_name filter is client-side — no server-side filter exists.
    if (params.account_name) {
      const needle = params.account_name.toLowerCase();
      calls = calls.filter((c) =>
        c.account_name?.toLowerCase().includes(needle)
      );
    }

    return new Ok(calls);
  }

  async getCallDetails(
    callId: string
  ): Promise<Result<ClariCallDetails, Error>> {
    const result = await this.get(
      `/call-details?id=${encodeURIComponent(callId)}`,
      ClariCallDetailsResponseSchema
    );

    if (result.isErr()) {
      if (
        result.error instanceof ClariHttpError &&
        result.error.statusCode === 404
      ) {
        return new Err(new ClariCallNotFoundError(callId));
      }
      return result;
    }

    return new Ok(result.value.call);
  }
}
