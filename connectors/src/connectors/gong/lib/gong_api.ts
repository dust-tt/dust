import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { GongAPIError } from "@connectors/connectors/gong/lib/errors";
import {
  ExternalOAuthTokenError,
  HTTPError,
  isNotFoundError,
} from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";

// Pass-through codec that is used to allow unknown properties.
const CatchAllCodec = t.record(t.string, t.unknown);

const GongUserCodec = t.intersection([
  t.union([
    t.type({
      active: t.undefined,
      created: t.undefined,
      emailAddress: t.undefined,
      firstName: t.undefined,
      id: t.undefined,
      lastName: t.undefined,
    }),
    t.partial({
      active: t.boolean,
      created: t.string,
      emailAddress: t.string,
      firstName: t.string,
      id: t.string,
      lastName: t.string,
    }),
  ]),
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

const GongContextObjectCodec = t.intersection([
  t.type({
    objectType: t.string,
    objectId: t.union([t.string, t.null]),
    fields: t.array(
      t.intersection([
        t.type({
          name: t.string,
          value: t.union([
            t.string,
            t.number,
            t.array(t.number),
            t.array(t.string),
            t.null,
          ]),
        }),
        CatchAllCodec,
      ])
    ),
  }),
  CatchAllCodec,
]);

const GongContextCodec = t.intersection([
  t.type({
    system: t.string,
    objects: t.array(GongContextObjectCodec),
  }),
  CatchAllCodec,
]);

const GongTranscriptMetadataWithoutTrackersCodec = t.intersection([
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
    // Parties are not defined on imported calls.
    parties: t.union([t.array(GongParticipantCodec), t.undefined]),
    context: t.union([t.array(GongContextCodec), t.undefined]),
  }),
  CatchAllCodec,
]);

export type GongTranscriptMetadataWithoutTrackers = t.TypeOf<
  typeof GongTranscriptMetadataWithoutTrackersCodec
>;

const GongTranscriptMetadataCodec = t.intersection([
  GongTranscriptMetadataWithoutTrackersCodec,
  t.type({
    content: t.intersection([
      t.type({
        trackers: t.array(
          t.intersection([
            t.type({
              id: t.string,
              name: t.string,
              count: t.number,
              type: t.string,
            }),
            CatchAllCodec,
          ])
        ),
      }),
      CatchAllCodec,
    ]),
  }),
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
        const headers = Object.fromEntries(
          Array.from(response.headers.entries()).filter(
            ([key]) =>
              key.toLowerCase().startsWith("x-") ||
              key.toLowerCase().startsWith("rate-")
          )
        );

        logger.info(
          {
            connectorId: this.connectorId,
            endpoint,
            headers,
            provider: "gong",
          },
          "Rate limit hit on Gong API."
        );
      }

      if (response.status === 404) {
        throw new HTTPError(response.statusText, response.status);
      }

      // Don't attempt to parse the body in JSON.
      const body = await response.text();

      throw GongAPIError.fromAPIError(response, {
        endpoint,
        connectorId: this.connectorId,
        body,
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
        "/calls/transcript",
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
        nextPageCursor: transcripts.records.cursor ?? null,
        totalRecords: transcripts.records.totalRecords,
      };
    } catch (err) {
      if (isNotFoundError(err)) {
        return {
          transcripts: [],
          nextPageCursor: null,
          totalRecords: 0,
        };
      }
      throw err;
    }
  }

  // https://gong.app.gong.io/settings/api/documentation#get-/v2/users
  async getUsers({ pageCursor }: { pageCursor: string | null }) {
    try {
      const users = await this.getRequest(
        "/users",
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
    trackersEnabled = false,
  }: {
    callIds: string[];
    pageCursor?: string | null;
    trackersEnabled?: boolean;
  }): Promise<{
    callsMetadata: GongTranscriptMetadata[];
    nextPageCursor: string | null;
  }> {
    // Calling the endpoint with an empty array of callIds causes a 400 error.
    if (callIds.length === 0) {
      return {
        callsMetadata: [],
        nextPageCursor: null,
      };
    }

    const body = {
      cursor: pageCursor,
      filter: {
        callIds,
      },
      contentSelector: {
        context: "Extended",
        exposedFields: {
          parties: true,
          ...(trackersEnabled ? { content: { trackers: true } } : {}),
        },
      },
    };
    try {
      if (trackersEnabled) {
        const callsMetadata = await this.postRequest(
          "/calls/extensive",
          body,
          GongPaginatedResults("calls", GongTranscriptMetadataCodec)
        );
        return {
          callsMetadata: callsMetadata.calls,
          nextPageCursor: callsMetadata.records.cursor ?? null,
        };
      } else {
        const callsMetadata = await this.postRequest(
          "/calls/extensive",
          body,
          GongPaginatedResults(
            "calls",
            GongTranscriptMetadataWithoutTrackersCodec
          )
        );
        // Adding empty trackers to present a uniformed type.
        return {
          callsMetadata: callsMetadata.calls.map((callMetadata) => ({
            ...callMetadata,
            content: { trackers: [] },
          })),
          nextPageCursor: callsMetadata.records.cursor ?? null,
        };
      }
    } catch (err) {
      if (isNotFoundError(err)) {
        return {
          callsMetadata: [],
          nextPageCursor: null,
        };
      }
      throw err;
    }
  }
}
