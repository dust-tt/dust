// eslint-disable-next-line dust/enforce-client-types-in-public-api

import { DustError } from "@app/lib/error";
import { errorToString } from "@dust-tt/client";

export { errorToString, normalizeError } from "@dust-tt/client";

export function normalizeAsInternalDustError(
  error: unknown
): DustError<"internal_error"> {
  if (error instanceof DustError && error.code === "internal_error") {
    return error;
  }

  return new DustError("internal_error", errorToString(error));
}
