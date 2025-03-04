import type { Result } from "@dust-tt/types";
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

const SpokenLanguageCodec = t.type({
  language: t.string,
  primary: t.boolean,
});

const UserCodec = t.type({
  id: t.string,
  emailAddress: t.string,
  created: t.string,
  active: t.boolean,
  emailAliases: t.array(t.string),
  trustedEmailAddress: t.string,
  firstName: t.string,
  lastName: t.string,
  title: t.string,
  phoneNumber: t.string,
  extension: t.string,
  personalMeetingUrls: t.array(t.string),
  settings: CatchAllCodec,
  managerId: t.string,
  meetingConsentPageUrl: t.string,
  spokenLanguages: t.array(SpokenLanguageCodec),
});

const SentenceCodec = t.type({
  start: t.number,
  end: t.number,
  text: t.string,
});

const TranscriptMonologueCodec = t.type({
  speakerId: t.string,
  topic: t.string,
  // A monologue is consistuted of multiple sentences.
  sentences: t.array(SentenceCodec),
});

const SingleCallTranscriptCodec = t.type({
  callId: t.string,
  // A transcript is consistuted of multiple monologues.
  transcript: t.array(TranscriptMonologueCodec),
});

// Generic codec for paginated results from Gong API.
const GongPaginatedResults = <C extends t.Mixed>(fieldName: string, codec: C) =>
  t.type({
    requestId: t.string,
    records: t.type({
      totalRecords: t.number,
      currentPageSize: t.number,
      currentPageNumber: t.number,
      cursor: t.string,
    }),
    [fieldName]: t.array(codec),
  });

export async function getGongAccessToken(
  connector: ConnectorResource
): Promise<Result<string, Error>> {
  const tokenResult = await getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    provider: "confluence",
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

  constructor(private readonly authToken: string) {}

  private async request<T>(endpoint: string, codec: t.Type<T>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        "Content-Type": "application/json",
      },
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

      throw new GongAPIError(
        `Confluence API responded with status: ${response.status}: ${this.baseUrl}${endpoint}`,
        {
          type: "http_response_error",
          status: response.status,
          data: { endpoint, response },
        }
      );
    }

    const responseBody = await response.json();
    const result = codec.decode(responseBody);

    if (isLeft(result)) {
      throw new GongAPIError("Response validation failed", {
        type: "validation_error",
        data: { endpoint },
      });
    }

    return result.right;
  }
}
