import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { validateUrl } from "@app/types/shared/utils/url_utils";

/**
 * @cc [owner:smb2268,label:security;api] http-schemes-only
 * A `source_url` sent on a document, table or folder upsert MUST be rejected with a 400
 * `invalid_request_error` unless it parses as an `http:` or `https:` URL. On success the
 * returned value is the standardized form from `validateUrl`, or `null` when none was sent.
 * Content nodes render `source_url` as navigation targets, so no other scheme may be stored.
 */
export function parseSourceUrlParam(
  sourceUrl: string | null | undefined
): Result<string | null, APIErrorWithContentfulStatusCode> {
  if (!sourceUrl) {
    return new Ok(null);
  }

  const { valid, standardized } = validateUrl(sourceUrl);
  if (!valid) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid request body, `source_url` if provided must be a valid URL.",
      },
    });
  }

  return new Ok(standardized);
}
