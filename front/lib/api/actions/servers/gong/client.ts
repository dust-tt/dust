import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  GongCall,
  GongCallTranscript,
} from "@app/lib/api/actions/servers/gong/schemas";
import {
  GongCallsResponseSchema,
  GongTranscriptsResponseSchema,
} from "@app/lib/api/actions/servers/gong/schemas";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const GONG_API_BASE_URL = "https://api.gong.io/v2";

export class GongApiError extends Error {
  public readonly isInvalidInput: boolean;
  public readonly statusCode: number;

  constructor(
    message: string,
    {
      isInvalidInput,
      statusCode,
    }: { isInvalidInput: boolean; statusCode: number }
  ) {
    super(message);
    this.isInvalidInput = isInvalidInput;
    this.statusCode = statusCode;
  }
}

export function getGongClient(
  authInfo: AuthInfo | undefined
): Result<GongClient, MCPError> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return new Err(
      new MCPError("No access token found. Please connect your Gong account.")
    );
  }

  return new Ok(new GongClient(accessToken));
}

export class GongClient {
  constructor(private accessToken: string) {}

  private async request<T extends z.Schema>(
    endpoint: string,
    schema: T,
    options: {
      method: "GET" | "POST";
      body?: unknown;
      queryParams?: Record<string, string>;
    } = { method: "GET" }
  ): Promise<Result<z.infer<T>, Error>> {
    let url = `${GONG_API_BASE_URL}${endpoint}`;

    if (options.queryParams) {
      const params = new URLSearchParams(options.queryParams);
      url += `?${params.toString()}`;
    }

    const response = await untrustedFetch(url, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new GongApiError(
          `Gong API error (${response.status}): ${errorText || response.statusText}`,
          {
            isInvalidInput: response.status === 400 || response.status === 422,
            statusCode: response.status,
          }
        )
      );
    }

    const rawData = await response.json();
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      const zodErrors = parseResult.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      }));
      logger.error(
        {
          endpoint,
          error: parseResult.error.message,
          zodErrors,
          responseKeys:
            rawData && typeof rawData === "object"
              ? Object.keys(rawData)
              : typeof rawData,
        },
        "[Gong] Invalid API response format"
      );
      return new Err(
        new Error(
          `Invalid Gong API response format: ${parseResult.error.message}`
        )
      );
    }

    return new Ok(parseResult.data);
  }

  async listCalls(options: {
    fromDateTime?: string;
    toDateTime?: string;
    cursor?: string;
  }): Promise<
    Result<
      { calls: GongCall[]; cursor?: string | null; totalRecords?: number },
      Error
    >
  > {
    const queryParams: Record<string, string> = {};
    if (options.fromDateTime) {
      queryParams.fromDateTime = options.fromDateTime;
    }
    if (options.toDateTime) {
      queryParams.toDateTime = options.toDateTime;
    }
    if (options.cursor) {
      queryParams.cursor = options.cursor;
    }

    const result = await this.request("/calls", GongCallsResponseSchema, {
      method: "GET",
      queryParams,
    });

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok({
      calls: result.value.calls,
      cursor: result.value.cursor,
      totalRecords: result.value.records?.totalRecords,
    });
  }

  async getCallsExtensive(
    callIds: string[]
  ): Promise<Result<GongCall[], Error>> {
    const result = await this.request(
      "/calls/extensive",
      GongCallsResponseSchema,
      {
        method: "POST",
        body: {
          filter: {
            callIds,
          },
          contentSelector: {
            exposedFields: {
              parties: true,
              content: {
                topics: true,
                trackers: true,
                pointsOfInterest: true,
                brief: true,
                outline: true,
                highlights: true,
                callOutcome: true,
                keyPoints: true,
              },
              interaction: {
                speakers: true,
                interactionStats: true,
                questions: true,
                video: true,
              },
              collaboration: {
                publicComments: true,
              },
            },
          },
        },
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.calls);
  }

  async getCallTranscripts(
    callIds: string[]
  ): Promise<Result<GongCallTranscript[], Error>> {
    const result = await this.request(
      "/calls/transcript",
      GongTranscriptsResponseSchema,
      {
        method: "POST",
        body: {
          filter: {
            callIds,
          },
        },
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.callTranscripts);
  }
}
