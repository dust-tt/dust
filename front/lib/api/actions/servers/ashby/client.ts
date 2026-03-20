import { MCPError } from "@app/lib/actions/mcp_errors";
import { untrustedFetch } from "@app/lib/egress/server";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type {
  AshbyAPIErrorInfo,
  AshbyApplicationFeedbackListRequest,
  AshbyApplicationInfoRequest,
  AshbyCandidateCreateNoteRequest,
  AshbyCandidateInfoRequest,
  AshbyCandidateListNotesRequest,
  AshbyCandidateNote,
  AshbyCandidateSearchRequest,
  AshbyFeedbackSubmission,
  AshbyJob,
  AshbyJobInfoRequest,
  AshbyJobPostingInfoRequest,
  AshbyJobPostingListRequest,
  AshbyJobPostingUpdateRequest,
  AshbyOffer,
  AshbyOfferInfoRequest,
  AshbyOfferListRequest,
  AshbyReferralCreateRequest,
  AshbyReportSynchronousRequest,
  AshbyUserSearchRequest,
} from "@app/lib/api/actions/servers/ashby/types";
import {
  AshbyAPIErrorResponseSchema,
  AshbyJobSchema,
  AshbyApplicationFeedbackListResponseSchema,
  AshbyApplicationInfoResponseSchema,
  AshbyCandidateCreateNoteResponseSchema,
  AshbyCandidateInfoResponseSchema,
  AshbyCandidateListNotesResponseSchema,
  AshbyCandidateSearchResponseSchema,
  AshbyJobInfoResponseSchema,
  AshbyJobPostingInfoResponseSchema,
  AshbyJobPostingListResponseSchema,
  AshbyJobPostingUpdateResponseSchema,
  AshbyOfferInfoResponseSchema,
  AshbyOfferListResponseSchema,
  AshbyReferralCreateResponseSchema,
  AshbyReferralFormInfoResponseSchema,
  AshbyReportSynchronousResponseSchema,
  AshbyUserSearchResponseSchema,
} from "@app/lib/api/actions/servers/ashby/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

const ASHBY_API_BASE_URL = "https://api.ashbyhq.com";

export class AshbyAPIError extends Error {
  readonly errorInfo: AshbyAPIErrorInfo | undefined;
  readonly errors: string[] | undefined;

  constructor({
    errorInfo,
    errors,
  }: {
    errorInfo?: AshbyAPIErrorInfo;
    errors?: string[];
  }) {
    const parts: string[] = [];
    if (errorInfo?.code) {
      parts.push(errorInfo.code);
    }
    if (errorInfo?.message) {
      parts.push(errorInfo.message);
    } else if (errors?.length) {
      parts.push(errors.join(", "));
    }
    super(
      `Ashby API error: ${parts.length > 0 ? parts.join(": ") : "unknown error"}`
    );
    this.errorInfo = errorInfo;
    this.errors = errors;
  }
}

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

  private async postRequest<T extends z.Schema>(
    endpoint: string,
    data: unknown,
    resultsSchema: T
  ): Promise<Result<z.infer<T>, Error>> {
    const response = await untrustedFetch(`${ASHBY_API_BASE_URL}/${endpoint}`, {
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

    const errorCheck = AshbyAPIErrorResponseSchema.safeParse(rawData);
    if (errorCheck.success) {
      return new Err(
        new AshbyAPIError({
          errorInfo: errorCheck.data.errorInfo,
          errors: errorCheck.data.errors,
        })
      );
    }

    const parseResult = z
      .object({ success: z.literal(true), results: resultsSchema })
      .safeParse(rawData);

    if (!parseResult.success) {
      logger.error(
        { endpoint, error: parseResult.error.message },
        "[Ashby] Invalid API response format"
      );
      return new Err(
        new Error(
          `Invalid Ashby API response format: ${parseResult.error.message}`
        )
      );
    }

    return new Ok(parseResult.data.results);
  }

  private async postPaginatedRequest<T extends z.ZodTypeAny>(
    endpoint: string,
    data: unknown,
    resultsSchema: T
  ): Promise<
    Result<
      { results: z.infer<T>; moreDataAvailable?: boolean; nextCursor?: string },
      Error
    >
  > {
    const response = await untrustedFetch(`${ASHBY_API_BASE_URL}/${endpoint}`, {
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

    const errorCheck = AshbyAPIErrorResponseSchema.safeParse(rawData);
    if (errorCheck.success) {
      return new Err(
        new AshbyAPIError({
          errorInfo: errorCheck.data.errorInfo,
          errors: errorCheck.data.errors,
        })
      );
    }

    const parseResult = z
      .object({
        success: z.literal(true),
        results: resultsSchema,
        moreDataAvailable: z.boolean().optional(),
        nextCursor: z.string().optional(),
      })
      .safeParse(rawData);
    if (!parseResult.success) {
      logger.error(
        { endpoint, error: parseResult.error.message },
        "[Ashby] Invalid API response format"
      );
      return new Err(
        new Error(
          `Invalid Ashby API response format: ${parseResult.error.message}`
        )
      );
    }

    const { results, moreDataAvailable, nextCursor } = parseResult.data;
    return new Ok({ results, moreDataAvailable, nextCursor });
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
    return this.postRequest(
      "applicationFeedback.list",
      request,
      AshbyApplicationFeedbackListResponseSchema
    );
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
    return this.postRequest(
      "candidate.listNotes",
      request,
      AshbyCandidateListNotesResponseSchema
    );
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

  async getJobPostingInfo(request: AshbyJobPostingInfoRequest) {
    return this.postRequest(
      "jobPosting.info",
      request,
      AshbyJobPostingInfoResponseSchema
    );
  }

  async listJobPostings(request: AshbyJobPostingListRequest) {
    return this.postRequest(
      "jobPosting.list",
      request,
      AshbyJobPostingListResponseSchema
    );
  }

  async updateJobPosting(request: AshbyJobPostingUpdateRequest) {
    return this.postRequest(
      "jobPosting.update",
      request,
      AshbyJobPostingUpdateResponseSchema
    );
  }

  async getCandidateInfo(request: AshbyCandidateInfoRequest) {
    return this.postRequest(
      "candidate.info",
      request,
      AshbyCandidateInfoResponseSchema
    );
  }

  async getOfferInfo(request: AshbyOfferInfoRequest) {
    return this.postRequest(
      "offer.info",
      request,
      AshbyOfferInfoResponseSchema
    );
  }

  async listOffers(
    request: AshbyOfferListRequest
  ): Promise<Result<AshbyOffer[], Error>> {
    return this.postRequest(
      "offer.list",
      request,
      AshbyOfferListResponseSchema
    );
  }

  async getJobInfo(request: AshbyJobInfoRequest) {
    return this.postRequest("job.info", request, AshbyJobInfoResponseSchema);
  }

  async listJobs(): Promise<Result<AshbyJob[], Error>> {
    const allJobs: AshbyJob[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.postPaginatedRequest(
        "job.list",
        { cursor },
        z.array(AshbyJobSchema)
      );
      if (response.isErr()) {
        return response;
      }
      allJobs.push(...response.value.results);
      cursor = response.value.moreDataAvailable ? response.value.nextCursor : undefined;
    } while (cursor);

    return new Ok(allJobs);
  }
}
