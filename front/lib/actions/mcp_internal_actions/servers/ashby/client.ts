import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  AshbyCandidateListResponse,
  AshbyFeedbackSubmitRequest,
  AshbyFeedbackSubmitResponse,
  AshbyReportSynchronousRequest,
  AshbyReportSynchronousResponse,
} from "@app/lib/actions/mcp_internal_actions/servers/ashby/types";
import {
  AshbyCandidateListResponseSchema,
  AshbyFeedbackSubmitResponseSchema,
  AshbyReportSynchronousResponseSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/ashby/types";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { DustAppSecret } from "@app/lib/models/dust_app_secret";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { decrypt, Err, normalizeError, Ok } from "@app/types";

const ASHBY_API_BASE_URL = "https://api.ashbyhq.com";

export async function getAshbyApiKey(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<Result<string, MCPError>> {
  const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
  if (
    !toolConfig ||
    !isLightServerSideMCPToolConfiguration(toolConfig) ||
    !toolConfig.secretName
  ) {
    return new Err(
      new MCPError(
        "Ashby API key not configured. Please configure a secret containing your Ashby API key in the agent settings.",
        {
          tracked: false,
        }
      )
    );
  }

  const secret = await DustAppSecret.findOne({
    where: {
      name: toolConfig.secretName,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  const apiKey = secret
    ? decrypt(secret.hash, auth.getNonNullableWorkspace().sId)
    : null;
  if (!apiKey) {
    return new Err(
      new MCPError(
        "Ashby API key not found in workspace secrets. Please check the secret configuration.",
        {
          tracked: false,
        }
      )
    );
  }

  return new Ok(apiKey);
}

export class AshbyClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.apiKey}:`).toString("base64");
    return `Basic ${credentials}`;
  }

  async listCandidates({
    cursor,
    limit = 100,
  }: {
    cursor?: string;
    limit?: number;
  }): Promise<Result<AshbyCandidateListResponse, Error>> {
    const response = await fetch(`${ASHBY_API_BASE_URL}/candidate.list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.getAuthHeader(),
      },
      body: JSON.stringify({
        cursor,
        limit,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Ashby API error (${response.status}): ${errorText || response.statusText}`
        )
      );
    }

    const responseText = await response.text();
    if (!responseText) {
      return new Err(new Error("Ashby API returned empty response"));
    }

    let rawData: unknown;
    try {
      rawData = JSON.parse(responseText);
    } catch (e) {
      const error = normalizeError(e);
      return new Err(new Error(`Invalid JSON response: ${error.message}`));
    }

    const parseResult = AshbyCandidateListResponseSchema.safeParse(rawData);

    if (!parseResult.success) {
      logger.error("[Ashby MCP Server] Invalid API response format", {
        error: parseResult.error.message,
        rawData,
      });
      return new Err(
        new Error(
          `Invalid Ashby API response format: ${parseResult.error.message}`
        )
      );
    }

    return new Ok(parseResult.data);
  }

  async submitFeedback(
    request: AshbyFeedbackSubmitRequest
  ): Promise<Result<AshbyFeedbackSubmitResponse, Error>> {
    const response = await fetch(
      `${ASHBY_API_BASE_URL}/applicationFeedback.submit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.getAuthHeader(),
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Ashby API error (${response.status}): ${errorText || response.statusText}`
        )
      );
    }

    const responseText = await response.text();
    if (!responseText) {
      return new Err(new Error("Ashby API returned empty response"));
    }

    let rawData: unknown;
    try {
      rawData = JSON.parse(responseText);
    } catch (e) {
      const error = normalizeError(e);
      return new Err(new Error(`Invalid JSON response: ${error.message}`));
    }

    const parseResult = AshbyFeedbackSubmitResponseSchema.safeParse(rawData);

    if (!parseResult.success) {
      logger.error("[Ashby MCP Server] Invalid API response format", {
        error: parseResult.error.message,
        rawData,
      });
      return new Err(
        new Error(
          `Invalid Ashby API response format: ${parseResult.error.message}`
        )
      );
    }

    return new Ok(parseResult.data);
  }

  async getReportData(
    request: AshbyReportSynchronousRequest
  ): Promise<Result<AshbyReportSynchronousResponse, Error>> {
    const response = await fetch(`${ASHBY_API_BASE_URL}/report.synchronous`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.getAuthHeader(),
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Ashby API error (${response.status}): ${errorText || response.statusText}`
        )
      );
    }

    const responseText = await response.text();
    if (!responseText) {
      return new Err(new Error("Ashby API returned empty response"));
    }

    let rawData: unknown;
    try {
      rawData = JSON.parse(responseText);
    } catch (e) {
      const error = normalizeError(e);
      return new Err(new Error(`Invalid JSON response: ${error.message}`));
    }

    const parseResult = AshbyReportSynchronousResponseSchema.safeParse(rawData);

    if (!parseResult.success) {
      logger.error("[Ashby MCP Server] Invalid API response format", {
        error: parseResult.error.message,
        rawData,
      });
      return new Err(
        new Error(
          `Invalid Ashby API response format: ${parseResult.error.message}`
        )
      );
    }

    return new Ok(parseResult.data);
  }
}
