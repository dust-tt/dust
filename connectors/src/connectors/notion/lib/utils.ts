import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { Logger } from "pino";

// Define the type codec for the Notion OAuth response
export const NotionOAuthResponse = t.type({
  workspace_id: t.string,
});

export type NotionOAuthResponseType = t.TypeOf<typeof NotionOAuthResponse>;

/**
 * Validates a Notion OAuth response to ensure it contains a workspace_id
 *
 * @param rawJson The raw JSON response from the OAuth service
 * @param logger Logger instance for error reporting
 * @returns The validation result (Either)
 */
export function validateNotionOAuthResponse(
  rawJson: unknown,
  logger: Logger
): Result<NotionOAuthResponseType, Error> {
  const validationResult = NotionOAuthResponse.decode(rawJson);

  if (isLeft(validationResult)) {
    logger.error(
      { errors: validationResult.left },
      "Invalid Notion OAuth response"
    );
    return new Err(new Error("Invalid Notion OAuth response"));
  }

  return new Ok(validationResult.right);
}
