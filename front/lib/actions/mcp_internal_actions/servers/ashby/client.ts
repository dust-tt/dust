import type { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  AshbyApplicationFeedbackListRequest,
  AshbyCandidateCreateNoteRequest,
  AshbyCandidateSearchRequest,
  AshbyFeedbackSubmission,
  AshbyReportSynchronousRequest,
} from "@app/lib/actions/mcp_internal_actions/servers/ashby/types";
import {
  AshbyApplicationFeedbackListResponseSchema,
  AshbyCandidateCreateNoteResponseSchema,
  AshbyCandidateSearchResponseSchema,
  AshbyReportSynchronousResponseSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/ashby/types";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { decrypt, Err, Ok } from "@app/types";

const ASHBY_API_BASE_URL = "https://api.ashbyhq.com";

export async function getAshbyClient(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<Result<AshbyClient, MCPError>> {
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

  const secret = await DustAppSecretModel.findOne({
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

  return new Ok(new AshbyClient(apiKey));
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

  private async postRequest<T extends z.Schema>(
    endpoint: string,
    data: unknown,
    schema: T
  ): Promise<Result<z.infer<T>, Error>> {
    const response = await fetch(`${ASHBY_API_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.getAuthHeader(),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Ashby API error (${response.status}): ${errorText || response.statusText}`
        )
      );
    }

    const rawData = await response.json();
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      logger.error(
        {
          error: parseResult.error.message,
        },
        "[Ashby] Invalid API response format"
      );
      return new Err(
        new Error(
          `Invalid Ashby API response format: ${parseResult.error.message}`
        )
      );
    }

    return new Ok(parseResult.data);
  }

  async getReportData(request: AshbyReportSynchronousRequest) {
    return this.postRequest(
      "report.synchronous",
      request,
      AshbyReportSynchronousResponseSchema
    );
  }

  async searchCandidates(request: AshbyCandidateSearchRequest) {
    return this.postRequest(
      "candidate.search",
      request,
      AshbyCandidateSearchResponseSchema
    );
  }

  async listApplicationFeedback(
    request: AshbyApplicationFeedbackListRequest
  ): Promise<Result<AshbyFeedbackSubmission[], Error>> {
    const response = await this.postRequest(
      "applicationFeedback.list",
      request,
      AshbyApplicationFeedbackListResponseSchema
    );
    if (response.isErr()) {
      return response;
    }

    return new Ok(response.value.results);
  }

  async createCandidateNote(request: AshbyCandidateCreateNoteRequest) {
    return this.postRequest(
      "candidate.createNote",
      request,
      AshbyCandidateCreateNoteResponseSchema
    );
  }
}
