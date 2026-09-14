import type { APIError } from "@anthropic-ai/sdk";

import { isRecord } from "@app/types/shared/utils/general";

const FILE_DOWNLOAD_ERROR = "Unable to download the file";

// Unwraps the `{ type: "error", error: { type, message } }` body Anthropic
// returns on a 400, or null when the error is not that shape.
function invalidRequestMessage(error: APIError): string | null {
  const body = error.error;
  if (
    error.status !== 400 ||
    error.type !== "invalid_request_error" ||
    typeof body !== "object" ||
    body === null ||
    !isRecord(body) ||
    body.type !== "error"
  ) {
    return null;
  }

  const details = body.error;
  if (
    typeof details !== "object" ||
    details === null ||
    !isRecord(details) ||
    details.type !== "invalid_request_error" ||
    typeof details.message !== "string"
  ) {
    return null;
  }

  return details.message;
}

export function isAnthropicFileDownloadError(error: APIError): boolean {
  const message = invalidRequestMessage(error);
  return message !== null && message.startsWith(FILE_DOWNLOAD_ERROR);
}
