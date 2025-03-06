import type { ModelId } from "@dust-tt/types";
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { GongAPIError } from "@connectors/connectors/gong/lib/errors";
import {
  ExternalOAuthTokenError,
  HTTPError,
  isNotFoundError,
} from "@connectors/lib/error";

// Pass-through codec that is used to allow unknown properties.
const CatchAllCodec = t.record(t.string, t.unknown);

const GongUserCodec = t.intersection([
  t.type({
    active: t.boolean,
    created: t.string,
    emailAddress: t.string,
    firstName: t.string,
    id: t.string,
    lastName: t.string,
  }),
  CatchAllCodec,
]);

export type GongAPIUser = t.TypeOf<typeof GongUserCodec>;

const GongTranscriptSentenceCodec = t.type({
  start: t.number,
  end: t.number,
  text: t.string,
});

const GongTranscriptMonologueCodec = t.type({
  speakerId: t.union([t.string, t.null]),
  // A monologue is constituted of multiple sentences.
  sentences: t.array(GongTranscriptSentenceCodec),
});

const GongCallTranscriptCodec = t.type({
  callId: t.string,
  // A transcript is constituted of multiple monologues.
  transcript: t.array(GongTranscriptMonologueCodec),
});

export type GongCallTranscript = t.TypeOf<typeof GongCallTranscriptCodec>;

export const GongParticipantCodec = t.intersection([
  t.type({
    speakerId: t.union([t.string, t.null]),
    userId: t.union([t.string, t.undefined]),
    emailAddress: t.union([t.string, t.undefined]),
  }),
  CatchAllCodec,
]);

const GongTranscriptMetadataCodec = t.intersection([
  t.type({
    metaData: t.intersection([
      t.type({
        id: t.string,
        url: t.string,
        primaryUserId: t.string,
        direction: t.union([
          t.literal("Inbound"),
          t.literal("Outbound"),
          t.literal("Conference"),
          t.literal("Unknown"),
        ]),
        scope: t.union([
          t.literal("Internal"),
          t.literal("External"),
          t.literal("Unknown"),
        ]),
        started: t.string, // ISO-8601 date (e.g., '2018-02-18T02:30:00-07:00').
        duration: t.number, // The duration of the call, in seconds.
        title: t.string,
        media: t.union([t.literal("Video"), t.literal("Audio")]),
        language: t.string, // The language codes (as defined by ISO-639-2B): eng, fre, spa, ger, and ita.
      }),
      CatchAllCodec,
    ]),
    parties: t.array(GongParticipantCodec),
  }),
  CatchAllCodec,
]);

export type GongTranscriptMetadata = t.TypeOf<
  typeof GongTranscriptMetadataCodec
>;

// Generic codec for paginated results from Gong API.
const GongPaginatedResults = <C extends t.Mixed, F extends string>(
  fieldName: F,
  codec: C
) =>
  t.intersection([
    t.type({
      requestId: t.string,
      records: t.type({
        currentPageNumber: t.number,
        currentPageSize: t.number,
        // The cursor only exists if there are more results.
        cursor: t.union([t.string, t.undefined]),
        totalRecords: t.number,
      }),
    }),
    t.type({
      [fieldName]: t.array(codec),
    } as Record<F, t.ArrayC<C>>),
  ]);

export class GongClient {
  private readonly baseUrl = "https://api.gong.io/v2";

  constructor(
    private readonly authToken: string,
    private readonly connectorId: ModelId
  ) {}

  /**
   * Handles response parsing and error handling for all API requests.
   */
  private async handleResponse<T>(
    response: Response,
    endpoint: string,
    codec: t.Type<T>
  ): Promise<T> {
    if (!response.ok) {
      if (response.status === 403 && response.statusText === "Forbidden") {
        throw new ExternalOAuthTokenError();
      }

      // Handle rate limiting
      // https://gong.app.gong.io/settings/api/documentation#overview
      if (response.status === 429) {
        // TODO(2025-03-04) - Implement this, we can read the Retry-After header.
      }

      if (response.status === 404) {
        throw new HTTPError(response.statusText, response.status);
      }

      throw GongAPIError.fromAPIError(response, {
        endpoint,
        connectorId: this.connectorId,
      });
    }

    const responseBody = await response.json();
    const result = codec.decode(responseBody);

    if (isLeft(result)) {
      const pathErrors = reporter.formatValidationErrors(result.left);

      throw GongAPIError.fromValidationError({
        connectorId: this.connectorId,
        endpoint,
        pathErrors,
      });
    }

    return result.right;
  }

  private async postRequest<T>(
    endpoint: string,
    body: unknown,
    codec: t.Type<T>
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      // Timeout after 30 seconds.
      signal: AbortSignal.timeout(30000),
    });

    return this.handleResponse(response, endpoint, codec);
  }

  private async getRequest<T>(
    endpoint: string,
    searchParams: Record<string, string | number | boolean | undefined>,
    codec: t.Type<T>
  ): Promise<T> {
    const urlSearchParams = new URLSearchParams(
      Object.entries(searchParams)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)])
    );

    const response = await fetch(
      `${this.baseUrl}${endpoint}?${urlSearchParams.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          "Content-Type": "application/json",
        },
        // Timeout after 30 seconds.
        signal: AbortSignal.timeout(30000),
      }
    );

    return this.handleResponse(response, endpoint, codec);
  }

  // https://gong.app.gong.io/settings/api/documentation#post-/v2/calls/transcript
  async getTranscripts({
    startTimestamp,
    pageCursor,
  }: {
    startTimestamp: number | null;
    pageCursor: string | null;
  }) {
    try {
      const transcripts = await this.postRequest(
        `/calls/transcript`,
        {
          cursor: pageCursor,
          filter: {
            fromDateTime: startTimestamp
              ? new Date(startTimestamp).toISOString()
              : undefined,
          },
        },
        GongPaginatedResults("callTranscripts", GongCallTranscriptCodec)
      );
      return {
        transcripts: transcripts.callTranscripts,
        nextPageCursor: transcripts.records.cursor,
      };
    } catch (err) {
      if (err instanceof GongAPIError && err.status === 404) {
        return {
          transcripts: [],
          nextPageCursor: null,
        };
      }
      throw err;
    }
  }

  // https://gong.app.gong.io/settings/api/documentation#get-/v2/users
  async getUsers({ pageCursor }: { pageCursor: string | null }) {
    try {
      const users = await this.getRequest(
        `/users`,
        pageCursor ? { cursor: pageCursor } : {},
        GongPaginatedResults("users", GongUserCodec)
      );

      return {
        users: users.users,
        nextPageCursor: users.records.cursor,
      };
    } catch (err) {
      if (isNotFoundError(err)) {
        return {
          users: [],
          nextPageCursor: null,
        };
      }

      throw err;
    }
  }

  async getUser({ userId }: { userId: string }) {
    try {
      return await this.getRequest(`/users/${userId}`, {}, GongUserCodec);
    } catch (err) {
      if (isNotFoundError(err)) {
        return null;
      }

      throw err;
    }
  }

  // https://gong.app.gong.io/settings/api/documentation#post-/v2/calls/extensive
  async getCallsMetadata({
    callIds,
    pageCursor = null,
  }: {
    callIds: string[];
    pageCursor?: string | null;
  }) {
    try {
      const callsMetadata = await this.postRequest(
        `/calls/extensive`,
        {
          cursor: pageCursor,
          filter: {
            callIds,
          },
          contentSelector: {
            exposedFields: {
              parties: true,
            },
          },
        },
        GongPaginatedResults("calls", GongTranscriptMetadataCodec)
      );
      return {
        callsMetadata: callsMetadata.calls,
        nextPageCursor: callsMetadata.records.cursor,
      };
    } catch (err) {
      if (err instanceof GongAPIError && err.status === 404) {
        return {
          callsMetadata: [],
          nextPageCursor: null,
        };
      }
      throw err;
    }
  }
}
