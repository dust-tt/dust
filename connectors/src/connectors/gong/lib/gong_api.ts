import type { ModelId, Result } from "@dust-tt/types";
import { Err, getOAuthConnectionAccessToken, Ok } from "@dust-tt/types";
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";

import { GongAPIError } from "@connectors/connectors/gong/lib/errors";
import { apiConfig } from "@connectors/lib/api/config";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

// Pass-through codec that is used to allow unknown properties.
const CatchAllCodec = t.record(t.string, t.unknown);

const GongUserCodec = t.intersection([
  t.type({
    id: t.string,
    emailAddress: t.string,
    created: t.string,
    active: t.boolean,
    firstName: t.string,
    lastName: t.string,
    title: t.string,
    phoneNumber: t.string,
  }),
  CatchAllCodec,
]);

const GongTranscriptSentenceCodec = t.type({
  start: t.number,
  end: t.number,
  text: t.string,
});

const GongTranscriptMonologueCodec = t.type({
  speakerId: t.string,
  topic: t.string,
  // A monologue is constituted of multiple sentences.
  sentences: t.array(GongTranscriptSentenceCodec),
});

const GongCallTranscriptCodec = t.type({
  callId: t.string,
  // A transcript is constituted of multiple monologues.
  transcript: t.array(GongTranscriptMonologueCodec),
});

// Generic codec for paginated results from Gong API.
const GongPaginatedResults = <C extends t.Mixed, F extends string>(
  fieldName: F,
  codec: C
) =>
  t.intersection([
    t.type({
      requestId: t.string,
      records: t.type({
        totalRecords: t.number,
        currentPageSize: t.number,
        currentPageNumber: t.number,
        cursor: t.string,
      }),
    }),
    t.type({
      [fieldName]: t.array(codec),
    } as Record<F, t.ArrayC<C>>),
  ]);

export async function getGongAccessToken(
  connector: ConnectorResource
): Promise<Result<string, Error>> {
  const tokenResult = await getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    provider: "gong",
    connectionId: connector.connectionId,
  });
  if (tokenResult.isErr()) {
    logger.error(
      { connectionId: connector.connectionId, error: tokenResult.error },
      "Error retrieving Gong access token."
    );

    return new Err(new Error(tokenResult.error.message));
  }

  return new Ok(tokenResult.value.access_token);
}

export class GongClient {
  private readonly baseUrl = "https://api.gong.io/v2";

  constructor(
    private readonly authToken: string,
    private readonly connectorId: ModelId
  ) {}

  private async request<T>(
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

    if (!response.ok) {
      if (response.status === 403 && response.statusText === "Forbidden") {
        throw new ExternalOAuthTokenError();
      }

      // Handle rate limiting
      // https://gong.app.gong.io/settings/api/documentation#overview
      if (response.status === 429) {
        // TODO(2025-03-04) - Implement this, we can read the Retry-After header.
      }

      throw GongAPIError.fromAPIError(response, {
        endpoint,
        connectorId: this.connectorId,
      });
    }

    const responseBody = await response.json();
    const result = codec.decode(responseBody);

    if (isLeft(result)) {
      throw GongAPIError.fromValidationError({
        connectorId: this.connectorId,
        endpoint,
      });
    }

    return result.right;
  }

  async getTranscripts({
    startTimestamp,
    pageCursor,
  }: {
    startTimestamp: number | null;
    pageCursor: string | null;
  }) {
    try {
      const transcripts = await this.request(
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
          pages: [],
          nextPageCursor: null,
        };
      }
      throw err;
    }
  }

  async getUsers({ pageCursor }: { pageCursor: string | null }) {
    try {
      const users = await this.request(
        `/users`,
        {
          cursor: pageCursor,
        },
        GongPaginatedResults("users", GongUserCodec)
      );
      return {
        users: users.users,
        nextPageCursor: users.records.cursor,
      };
    } catch (err) {
      if (err instanceof GongAPIError && err.status === 404) {
        return {
          users: [],
          nextPageCursor: null,
        };
      }
      throw err;
    }
  }
}
