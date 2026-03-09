import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type {
  AshbyApplicationFeedbackListRequest,
  AshbyApplicationInfoRequest,
  AshbyCandidateCreateNoteRequest,
  AshbyCandidateListNotesRequest,
  AshbyCandidateNote,
  AshbyCandidateSearchRequest,
  AshbyFeedbackSubmission,
  AshbyFileAttachment,
  AshbyJob,
  AshbyReferralCreateRequest,
  AshbyReportSynchronousRequest,
  AshbyUserSearchRequest,
} from "@app/lib/api/actions/servers/ashby/types";
import {
  AshbyApplicationFeedbackListResponseSchema,
  AshbyApplicationInfoResponseSchema,
  AshbyCandidateCreateNoteResponseSchema,
  AshbyCandidateListNotesResponseSchema,
  AshbyCandidateSearchResponseSchema,
  AshbyCandidateUploadResumeResponseSchema,
  AshbyJobListResponseSchema,
  AshbyReferralCreateResponseSchema,
  AshbyReferralFormInfoResponseSchema,
  AshbyReportSynchronousResponseSchema,
  AshbyUserSearchResponseSchema,
} from "@app/lib/api/actions/servers/ashby/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { z } from "zod";

const ASHBY_API_BASE_URL = "https://api.ashbyhq.com";

export function getAshbyClient(
  extra: ToolHandlerExtra
): Result<AshbyClient, MCPError> {
  const apiKey = extra.authInfo?.token;
  if (!apiKey) {
    return new Err(
      new MCPError(
        "Ashby API key not configured. Please configure the API key in the MCP server settings.",
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

  private async parseResponse<T extends z.Schema>(
    endpoint: string,
    response: Response,
    schema: T
  ): Promise<Result<z.infer<T>, Error>> {
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
          endpoint,
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

  private async postRequest<T extends z.Schema>(
    endpoint: string,
    data: unknown,
    schema: T
  ): Promise<Result<z.infer<T>, Error>> {
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(`${ASHBY_API_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.getAuthHeader(),
      },
      body: JSON.stringify(data),
    });

    return this.parseResponse(endpoint, response, schema);
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

  async getApplicationInfo(request: AshbyApplicationInfoRequest) {
    return this.postRequest(
      "application.info",
      request,
      AshbyApplicationInfoResponseSchema
    );
  }

  async listCandidateNotes(
    request: AshbyCandidateListNotesRequest
  ): Promise<Result<AshbyCandidateNote[], Error>> {
    const response = await this.postRequest(
      "candidate.listNotes",
      request,
      AshbyCandidateListNotesResponseSchema
    );
    if (response.isErr()) {
      return response;
    }

    return new Ok(response.value.results);
  }

  async searchUser(request: AshbyUserSearchRequest) {
    return this.postRequest(
      "user.search",
      request,
      AshbyUserSearchResponseSchema
    );
  }

  async getReferralFormInfo() {
    return this.postRequest(
      "referralForm.info",
      {},
      AshbyReferralFormInfoResponseSchema
    );
  }

  async createReferral(request: AshbyReferralCreateRequest) {
    return this.postRequest(
      "referral.create",
      request,
      AshbyReferralCreateResponseSchema
    );
  }

  async uploadCandidateResume(candidateId: string, file: AshbyFileAttachment) {
    const formData = new FormData();
    formData.append("candidateId", candidateId);
    const blob = new Blob([new Uint8Array(file.buffer)], {
      type: file.contentType,
    });
    formData.append("resume", blob, file.filename);

    const response = await fetch(
      `${ASHBY_API_BASE_URL}/candidate.uploadResume`,
      {
        method: "POST",
        headers: {
          Authorization: this.getAuthHeader(),
        },
        body: formData,
      }
    );

    return this.parseResponse(
      "candidate.uploadResume",
      response,
      AshbyCandidateUploadResumeResponseSchema
    );
  }

  async listJobs(): Promise<Result<AshbyJob[], Error>> {
    const allJobs: AshbyJob[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.postRequest(
        "job.list",
        { cursor },
        AshbyJobListResponseSchema
      );
      if (response.isErr()) {
        return response;
      }

      allJobs.push(...response.value.results);
      cursor = response.value.moreDataAvailable
        ? response.value.nextCursor
        : undefined;
    } while (cursor);

    return new Ok(allJobs);
  }
}
