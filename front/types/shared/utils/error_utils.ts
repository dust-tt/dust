// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { errorToString } from "@dust-tt/client";

import { DustError } from "@app/lib/error";
export { errorToString, normalizeError } from "@dust-tt/client";

export function normalizeAsInternalDustError(
  error: unknown
): DustError<"internal_error"> {
  if (error instanceof DustError && error.code === "internal_error") {
    return error;
  }

  return new DustError("internal_error", errorToString(error));
}
