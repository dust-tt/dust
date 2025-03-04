import type { Result } from "@dust-tt/types";
import { Err, getOAuthConnectionAccessToken, Ok } from "@dust-tt/types";
import { isLeft } from "fp-ts/Either";
import type * as t from "io-ts";

import { GongAPIError } from "@connectors/connectors/gong/lib/errors";
import { apiConfig } from "@connectors/lib/api/config";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

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
