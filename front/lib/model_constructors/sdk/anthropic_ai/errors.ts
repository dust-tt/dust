import type { APIError } from "@anthropic-ai/sdk";

import { isRecord } from "@app/types/shared/utils/general";

const FILE_DOWNLOAD_ERROR = "Unable to download the file";

export function isAnthropicFileDownloadError(error: APIError): boolean {
  const body = error.error;
  if (
    error.status !== 400 ||
    error.type !== "invalid_request_error" ||
    typeof body !== "object" ||
    body === null ||
    !isRecord(body) ||
    body.type !== "error"
  ) {
    return false;
  }

  const details = body.error;
  return (
    typeof details === "object" &&
    details !== null &&
    isRecord(details) &&
    details.type === "invalid_request_error" &&
    typeof details.message === "string" &&
    details.message.startsWith(FILE_DOWNLOAD_ERROR)
  );
}
