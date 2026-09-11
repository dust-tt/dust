import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  CreateCursorAgentResponseSchema,
  CreateCursorRunResponseSchema,
  CursorAgentSchema,
  CursorAgentUsageResponseSchema,
  CursorApiErrorResponseSchema,
  CursorApiKeyInfoSchema,
  CursorArtifactDownloadResponseSchema,
  CursorArtifactsResponseSchema,
  CursorIdResponseSchema,
  CursorJsonObjectSchema,
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
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { z } from "zod";
import { fromError } from "zod-validation-error";

const CURSOR_API_BASE_URL = "https://api.cursor.com";

const REDACTED_API_KEY = "[redacted]";

// Describes a rejected payload for logs without asserting its shape: the keys alone are enough to
// tell an unexpected schema from an error envelope or a proxy's HTML page.
function describeResponseShape(rawData: unknown): string[] | string {
  const asObject = CursorJsonObjectSchema.safeParse(rawData);
  return asObject.success ? Object.keys(asObject.data) : "not-an-object";
}

// Only the response fields the formatter reads. `untrustedFetch` resolves to undici's `Response`,
// which is not assignable to the global one.
interface UpstreamErrorResponse {
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
}

// Turns a failed Cursor response into a single human-readable line. Cursor reports failures as
// `{ error: { code, message, helpUrl } }`, but the body is external data and may be anything, so
// the raw text is the fallback.
function formatUpstreamError(
  response: UpstreamErrorResponse,
  rawError: string
): string {
  let message = rawError || response.statusText;

  const json = safeParseJSON(rawError);
  if (json.isOk()) {
    const parsed = CursorApiErrorResponseSchema.safeParse(json.value);
    if (parsed.success && parsed.data.error) {
      const { code, message: errorMessage, helpUrl } = parsed.data.error;
      if (errorMessage) {
        message = errorMessage;
      }
      if (code) {
        message = `${code}: ${message}`;
      }
      if (helpUrl) {
        message += ` (${helpUrl})`;
      }
    }
  }

  const retryAfter = response.headers.get("retry-after");
  if (response.status === 429 && retryAfter) {
    message += ` Retry after ${retryAfter} seconds.`;
  }

  return message;
}

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
   * Strips the API key from any string that leaves this class. `fetch` header validation echoes
   * the offending header value, so a malformed key (an embedded newline, for instance) otherwise
   * reaches the model and the logs verbatim through the thrown error's message.
   */
  private redactApiKey(message: string): string {
    if (this.apiKey.length === 0) {
      return message;
    }
    return message.replaceAll(this.apiKey, REDACTED_API_KEY);
  }

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
        return new Err(
          new Error(
            this.redactApiKey(
              `Cursor API request failed (${response.status}): ${formatUpstreamError(response, rawError)}`
            )
          )
        );
      }

      const rawData = await response.json();
      const parsed = schema.safeParse(rawData);
      if (!parsed.success) {
        logger.error(
          {
            path,
            error: this.redactApiKey(fromError(parsed.error).toString()),
            responseShape: describeResponseShape(rawData),
          },
          "[CursorCloudAgents] Invalid API response"
        );
        return new Err(new Error("Cursor returned an invalid API response."));
      }
      return new Ok(parsed.data);
    } catch (error) {
      return new Err(
        new Error(
          this.redactApiKey(
            `Cursor API request failed: ${normalizeError(error).message}`
          )
        )
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
