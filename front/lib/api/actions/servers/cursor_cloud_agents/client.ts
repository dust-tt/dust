import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  CreateCursorAgentResponseSchema,
  CreateCursorRunResponseSchema,
  CursorAgentSchema,
  CursorAgentUsageResponseSchema,
  CursorApiKeyInfoSchema,
  CursorArtifactDownloadResponseSchema,
  CursorArtifactsResponseSchema,
  CursorIdResponseSchema,
  CursorModelsResponseSchema,
  CursorRepositoriesResponseSchema,
  CursorRunSchema,
  ListCursorAgentsResponseSchema,
  ListCursorRunsResponseSchema,
} from "@app/lib/api/actions/servers/cursor_cloud_agents/schemas";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { z } from "zod";

const CURSOR_API_BASE_URL = "https://api.cursor.com";

interface CursorApiRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  query?: Record<string, boolean | number | string | undefined>;
}

interface CursorPrompt {
  text: string;
  images?: Array<{ url: string }>;
}

export interface CreateCursorAgentRequest {
  prompt: CursorPrompt;
  name?: string;
  repos?: Array<{ url: string; startingRef?: string; prUrl?: string }>;
  env?: { type: "cloud" | "pool" | "machine"; name?: string };
  model?: { id: string; params?: Array<{ id: string; value: string }> };
  mode?: "agent" | "plan";
  workOnCurrentBranch?: boolean;
  autoCreatePR?: boolean;
  skipReviewerRequest?: boolean;
}

export interface CreateCursorRunRequest {
  prompt: CursorPrompt;
  mode?: "agent" | "plan";
}

export function getCursorCloudAgentsClient(
  authInfo: AuthInfo | undefined
): Result<CursorCloudAgentsClient, MCPError> {
  const apiKey = authInfo?.token;
  if (!apiKey) {
    return new Err(
      new MCPError(
        "Cursor API key not configured. Ask a workspace admin to configure it in the MCP server settings.",
        { tracked: false }
      )
    );
  }
  return new Ok(new CursorCloudAgentsClient(apiKey));
}

export class CursorCloudAgentsClient {
  constructor(private readonly apiKey: string) {}

  /**
   * @cc [owner:sflory,label:security;error-handling] cursor-api-token-boundary
   * The Cursor API key MUST only be sent in the Authorization header to the fixed
   * `https://api.cursor.com` origin and MUST NOT appear in errors or logs.
   */
  private async request<T extends z.Schema>(
    path: string,
    schema: T,
    options: CursorApiRequestOptions = {}
  ): Promise<Result<z.infer<T>, Error>> {
    const url = new URL(path, CURSOR_API_BASE_URL);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    try {
      const response = await untrustedFetch(url.toString(), {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        const rawError = await response.text();
        let message = rawError || response.statusText;
        try {
          const parsed = JSON.parse(rawError) as {
            error?: { code?: string; message?: string; helpUrl?: string };
          };
          if (parsed.error?.message) {
            message = parsed.error.message;
          }
          if (parsed.error?.code) {
            message = `${parsed.error.code}: ${message}`;
          }
          if (parsed.error?.helpUrl) {
            message += ` (${parsed.error.helpUrl})`;
          }
        } catch {
          // Keep the response text when Cursor did not return its JSON error shape.
        }

        const retryAfter = response.headers.get("retry-after");
        if (response.status === 429 && retryAfter) {
          message += ` Retry after ${retryAfter} seconds.`;
        }
        return new Err(
          new Error(
            `Cursor API request failed (${response.status}): ${message}`
          )
        );
      }

      const rawData = await response.json();
      const parsed = schema.safeParse(rawData);
      if (!parsed.success) {
        logger.error(
          {
            path,
            error: parsed.error.message,
            responseKeys:
              rawData && typeof rawData === "object"
                ? Object.keys(rawData)
                : typeof rawData,
          },
          "[CursorCloudAgents] Invalid API response"
        );
        return new Err(new Error("Cursor returned an invalid API response."));
      }
      return new Ok(parsed.data);
    } catch (error) {
      return new Err(
        new Error(`Cursor API request failed: ${normalizeError(error).message}`)
      );
    }
  }

  createAgent(body: CreateCursorAgentRequest) {
    return this.request("/v1/agents", CreateCursorAgentResponseSchema, {
      method: "POST",
      body,
    });
  }

  listAgents(options: {
    limit?: number;
    cursor?: string;
    includeArchived?: boolean;
  }) {
    return this.request("/v1/agents", ListCursorAgentsResponseSchema, {
      query: options,
    });
  }

  getAgent(agentId: string) {
    return this.request(
      `/v1/agents/${encodeURIComponent(agentId)}`,
      CursorAgentSchema
    );
  }

  createRun(agentId: string, body: CreateCursorRunRequest) {
    return this.request(
      `/v1/agents/${encodeURIComponent(agentId)}/runs`,
      CreateCursorRunResponseSchema,
      { method: "POST", body }
    );
  }

  listRuns(agentId: string, options: { limit?: number; cursor?: string }) {
    return this.request(
      `/v1/agents/${encodeURIComponent(agentId)}/runs`,
      ListCursorRunsResponseSchema,
      { query: options }
    );
  }

  getRun(agentId: string, runId: string) {
    return this.request(
      `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
      CursorRunSchema
    );
  }

  cancelRun(agentId: string, runId: string) {
    return this.request(
      `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/cancel`,
      CursorIdResponseSchema,
      { method: "POST" }
    );
  }

  getAgentUsage(agentId: string, runId?: string) {
    return this.request(
      `/v1/agents/${encodeURIComponent(agentId)}/usage`,
      CursorAgentUsageResponseSchema,
      { query: { runId } }
    );
  }

  listArtifacts(agentId: string) {
    return this.request(
      `/v1/agents/${encodeURIComponent(agentId)}/artifacts`,
      CursorArtifactsResponseSchema
    );
  }

  getArtifactDownloadUrl(agentId: string, path: string) {
    return this.request(
      `/v1/agents/${encodeURIComponent(agentId)}/artifacts/download`,
      CursorArtifactDownloadResponseSchema,
      { query: { path } }
    );
  }

  archiveAgent(agentId: string) {
    return this.request(
      `/v1/agents/${encodeURIComponent(agentId)}/archive`,
      CursorIdResponseSchema,
      { method: "POST" }
    );
  }

  unarchiveAgent(agentId: string) {
    return this.request(
      `/v1/agents/${encodeURIComponent(agentId)}/unarchive`,
      CursorIdResponseSchema,
      { method: "POST" }
    );
  }

  deleteAgent(agentId: string) {
    return this.request(
      `/v1/agents/${encodeURIComponent(agentId)}`,
      CursorIdResponseSchema,
      { method: "DELETE" }
    );
  }

  getApiKeyInfo() {
    return this.request("/v1/me", CursorApiKeyInfoSchema);
  }

  listModels() {
    return this.request("/v1/models", CursorModelsResponseSchema);
  }

  listRepositories() {
    return this.request("/v1/repositories", CursorRepositoriesResponseSchema);
  }
}
