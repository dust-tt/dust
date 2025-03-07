import { Err, Ok } from "@dust-tt/client";
import type { Result } from "@dust-tt/types";
import { getOAuthConnectionAccessToken } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { Logger } from "pino";

import { apiConfig } from "@connectors/lib/api/config";
import logger from "@connectors/logger/logger";

// Define the type codec for the Gong OAuth response
const GongOAuthResponse = t.type({
  api_base_url_for_customer: t.string,
});

type GongOAuthResponseType = t.TypeOf<typeof GongOAuthResponse>;

/**
 * Validates a Gong OAuth response to ensure it contains a api_base_url_for_customer
 *
 * @param rawJson The raw JSON response from the OAuth service
 * @param logger Logger instance for error reporting
 * @returns The validation result (Either)
 */
function validateGongOAuthResponse(
  rawJson: unknown,
  logger: Logger
): Result<GongOAuthResponseType, Error> {
  const validationResult = GongOAuthResponse.decode(rawJson);

  if (isLeft(validationResult)) {
    logger.error(
      { errors: validationResult.left },
      "Invalid Gong OAuth response"
    );
    return new Err(new Error("Invalid Gong OAuth response"));
  }

  return new Ok(validationResult.right);
}

export async function baseUrlFromConnectionId(connectionId: string) {
  const tokRes = await getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    provider: "gong",
    connectionId,
  });
  if (tokRes.isErr()) {
    return tokRes;
  }

  const validationRes = validateGongOAuthResponse(
    tokRes.value.scrubbed_raw_json,
    logger
  );
  if (validationRes.isErr()) {
    logger.error(
      {
        errors: validationRes.error,
        rawJson: tokRes.value.scrubbed_raw_json,
      },
      "Invalid Gong OAuth response"
    );

    return new Err(new Error("Invalid Gong OAuth response"));
  }

  return new Ok(validationRes.value.api_base_url_for_customer);
}
