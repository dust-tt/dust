import type { APIError } from "@anthropic-ai/sdk";

import { isRecord } from "@app/types/shared/utils/general";

const FILE_DOWNLOAD_ERROR = "Unable to download the file";

// Anthropic reports a rejected tool schema by the tool's position in the sent
// `tools` array. Tool search nests the definition under `custom`.
const TOOL_SCHEMA_PATH = /^tools\.(\d+)\.(?:custom\.)?input_schema\b/;

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

/**
 * @cc [owner:philipperolet,label:error-handling] anthropic-tool-schema-index
 * Returns the index only for a tool-schema rejection; every other Anthropic
 * error yields null so it keeps its original classification.
 */
export function rejectedToolSchemaIndex(error: APIError): number | null {
  const message = invalidRequestMessage(error);
  const match = message !== null ? TOOL_SCHEMA_PATH.exec(message) : null;
  return match !== null ? Number(match[1]) : null;
}
