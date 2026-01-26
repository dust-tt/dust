import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const GONG_API_BASE_URL = "https://api.gong.io/v2";

// Helper to accept both string and number IDs (Gong API returns numeric IDs)
// Using z.coerce.string() to properly coerce numbers to strings with correct type inference
const idSchema = z.coerce.string();

// Zod schemas for API response validation

const GongUserSchema = z
  .object({
    id: idSchema,
    emailAddress: z.string(),
    firstName: z.string().optional().nullable(),
    lastName: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    phoneNumber: z.string().optional().nullable(),
    extension: z.string().optional().nullable(),
    personalMeetingUrls: z.array(z.string()).optional().nullable(),
    settings: z
      .object({
        webConferencesRecorded: z.boolean().optional(),
        preventWebConferenceRecording: z.boolean().optional(),
        telephonyCallsImported: z.boolean().optional(),
        emailsImported: z.boolean().optional(),
        preventEmailImport: z.boolean().optional(),
        nonRecordedMeetingsImported: z.boolean().optional(),
        gpiEnabled: z.boolean().optional(),
      })
      .optional()
      .nullable(),
    managerId: idSchema.optional().nullable(),
    meetingConsentPageUrl: z.string().optional().nullable(),
    active: z.boolean().optional().nullable(),
    created: z.string().optional().nullable(),
    spokenLanguages: z
      .array(
        z.object({
          language: z.string(),
          primary: z.boolean().optional(),
        })
      )
      .optional()
      .nullable(),
  })
  .passthrough();

const GongUsersResponseSchema = z
  .object({
    requestId: z.string().optional(),
    users: z.array(GongUserSchema),
    records: z
      .object({
        totalRecords: z.number(),
        currentPageNumber: z.number(),
        currentPageSize: z.number(),
      })
      .optional(),
  })
  .passthrough();

const GongPartySchema = z
  .object({
    id: idSchema.optional().nullable(),
    emailAddress: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    userId: idSchema.optional().nullable(),
    speakerId: idSchema.optional().nullable(),
    context: z.array(z.any()).optional().nullable(),
    affiliation: z.string().optional().nullable(), // Can be "Internal", "External", "Unknown" or other values
    phoneNumber: z.string().optional().nullable(),
  })
  .passthrough();

const GongCallSchema = z
  .object({
    id: idSchema,
    url: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    scheduled: z.string().optional().nullable(),
    started: z.string().optional().nullable(),
    duration: z.number().optional().nullable(),
    primaryUserId: idSchema.optional().nullable(),
    direction: z.string().optional().nullable(), // "Inbound", "Outbound", "Conference", "Unknown"
    system: z.string().optional().nullable(),
    scope: z.string().optional().nullable(), // "Internal", "External", "Unknown"
    media: z.string().optional().nullable(), // "Video", "Audio"
    language: z.string().optional().nullable(),
    workspaceId: idSchema.optional().nullable(),
    sdrDisposition: z.string().optional().nullable(),
    clientUniqueId: z.string().optional().nullable(),
    customData: z.string().optional().nullable(),
    purpose: z.string().optional().nullable(),
    meetingUrl: z.string().optional().nullable(),
    isPrivate: z.boolean().optional().nullable(),
    calendarEventId: z.string().optional().nullable(),
    parties: z.array(GongPartySchema).optional().nullable(),
    content: z
      .object({
        topics: z
          .array(
            z
              .object({
                name: z.string(),
                duration: z.number().optional().nullable(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
        trackers: z
          .array(
            z
              .object({
                id: idSchema.optional().nullable(),
                name: z.string(),
                count: z.number().optional().nullable(),
                occurrences: z
                  .array(
                    z
                      .object({
                        startTime: z.number().optional().nullable(),
                        speakerId: idSchema.optional().nullable(),
                      })
                      .passthrough()
                  )
                  .optional()
                  .nullable(),
                type: z.string().optional().nullable(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
        pointsOfInterest: z
          .object({
            actionItems: z
              .array(
                z
                  .object({
                    snippetStartTime: z.number().optional().nullable(),
                    snippetEndTime: z.number().optional().nullable(),
                    speakerID: idSchema.optional().nullable(),
                    snippet: z.string().optional().nullable(),
                  })
                  .passthrough()
              )
              .optional()
              .nullable(),
          })
          .passthrough()
          .optional()
          .nullable(),
        brief: z.string().optional().nullable(),
        outline: z
          .array(
            z
              .object({
                section: z.string().optional().nullable(),
                startTime: z.number().optional().nullable(),
                duration: z.number().optional().nullable(),
                items: z.array(z.string()).optional().nullable(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
        highlights: z
          .array(
            z
              .object({
                title: z.string().optional().nullable(),
                items: z
                  .array(
                    z
                      .object({
                        text: z.string().optional().nullable(),
                        startTimes: z.array(z.number()).optional().nullable(),
                      })
                      .passthrough()
                  )
                  .optional()
                  .nullable(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
        callOutcome: z
          .object({
            id: idSchema.optional().nullable(),
            category: z.string().optional().nullable(),
            name: z.string().optional().nullable(),
          })
          .passthrough()
          .optional()
          .nullable(),
        keyPoints: z
          .array(
            z
              .object({
                text: z.string().optional().nullable(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
      })
      .passthrough()
      .optional()
      .nullable(),
    interaction: z
      .object({
        speakers: z
          .array(
            z
              .object({
                id: idSchema.optional().nullable(),
                userId: idSchema.optional().nullable(),
                talkTime: z.number().optional().nullable(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
        interactionStats: z
          .array(
            z
              .object({
                name: z.string().optional().nullable(),
                value: z.number().optional().nullable(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
        questions: z
          .object({
            companyCount: z.number().optional().nullable(),
            nonCompanyCount: z.number().optional().nullable(),
          })
          .passthrough()
          .optional()
          .nullable(),
        video: z
          .array(
            z
              .object({
                name: z.string().optional().nullable(),
                duration: z.number().optional().nullable(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
      })
      .passthrough()
      .optional()
      .nullable(),
    collaboration: z
      .object({
        publicComments: z
          .array(
            z
              .object({
                id: idSchema.optional().nullable(),
                audioStartTime: z.number().optional().nullable(),
                audioEndTime: z.number().optional().nullable(),
                commenterUserId: idSchema.optional().nullable(),
                comment: z.string().optional().nullable(),
                posted: z.string().optional().nullable(),
                inReplyTo: idSchema.optional().nullable(),
                duringCall: z.boolean().optional().nullable(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
      })
      .passthrough()
      .optional()
      .nullable(),
  })
  .passthrough();

// Pagination schema - Gong uses "records" wrapper with metadata
const GongRecordsSchema = z
  .object({
    totalRecords: z.number(),
    currentPageNumber: z.number().optional(),
    currentPageSize: z.number().optional(),
  })
  .passthrough();

const GongCallsResponseSchema = z
  .object({
    requestId: z.string().optional().nullable(),
    calls: z.array(GongCallSchema),
    records: GongRecordsSchema.optional().nullable(),
    cursor: z.string().optional().nullable(),
  })
  .passthrough();

const GongTranscriptSentenceSchema = z
  .object({
    start: z.number(),
    end: z.number(),
    text: z.string(),
    speakerId: idSchema.optional().nullable(),
  })
  .passthrough();

const GongCallTranscriptSchema = z
  .object({
    callId: idSchema,
    transcript: z.array(GongTranscriptSentenceSchema),
  })
  .passthrough();

const GongTranscriptsResponseSchema = z
  .object({
    requestId: z.string().optional().nullable(),
    callTranscripts: z.array(GongCallTranscriptSchema),
    records: GongRecordsSchema.optional().nullable(),
    cursor: z.string().optional().nullable(),
  })
  .passthrough();

// Export types inferred from schemas
export type GongUser = z.infer<typeof GongUserSchema>;
export type GongCall = z.infer<typeof GongCallSchema>;
export type GongCallTranscript = z.infer<typeof GongCallTranscriptSchema>;
export type GongTranscriptSentence = z.infer<
  typeof GongTranscriptSentenceSchema
>;

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

class GongClient {
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
      // Log detailed error information for debugging
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
          // Log a sample of the raw response structure (without sensitive data)
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

  async listUsers(): Promise<Result<GongUser[], Error>> {
    const result = await this.request("/users", GongUsersResponseSchema);

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.users);
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
