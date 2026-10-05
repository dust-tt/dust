import type { APIErrorType } from "@app/types/error";
import { isAPIErrorType } from "@app/types/error";
import { isRecord } from "@app/types/shared/utils/general";

export type DisplayableAPIError = {
  // `null` when the error has no type the client knows (network error, newer server, …).
  type: APIErrorType | null;
  // The server message, when it sent one. Only shown as raw context next to the translated type.
  rawMessage: string | null;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * @cc [owner:Nils-Fedrigo,label:error-handling] displayable-api-error-never-throws
 * `toDisplayableAPIError` MUST accept any thrown or returned value without throwing:
 * - an `APIErrorResponse` (what `fetcher` throws) or a bare `APIError`: its `type`, and its
 *   `message` when present. When `connectors_error` is present, its message is the raw message.
 * - an error body whose `type` the client does not know (a newer server): `type` is `null` and
 *   its message is kept.
 * - an `Error` or a string: `type` is `null` and the message is kept.
 * - anything else: `{ type: null, rawMessage: null }`.
 */
export function toDisplayableAPIError(error: unknown): DisplayableAPIError {
  if (typeof error === "string") {
    return { type: null, rawMessage: nonEmptyString(error) };
  }
  if (error instanceof Error) {
    return { type: null, rawMessage: nonEmptyString(error.message) };
  }
  if (typeof error !== "object" || error === null || !isRecord(error)) {
    return { type: null, rawMessage: null };
  }

  const body =
    typeof error.error === "object" &&
    error.error !== null &&
    isRecord(error.error)
      ? error.error
      : error;

  const type =
    typeof body.type === "string" && isAPIErrorType(body.type)
      ? body.type
      : null;

  const connectorsError =
    typeof body.connectors_error === "object" &&
    body.connectors_error !== null &&
    isRecord(body.connectors_error)
      ? body.connectors_error
      : null;

  return {
    type,
    rawMessage:
      nonEmptyString(connectorsError?.message) ?? nonEmptyString(body.message),
  };
}
