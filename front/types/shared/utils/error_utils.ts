import { DustError } from "@app/lib/error";
import { errorToString, normalizeError } from "@dust-tt/client";
export { errorToString, normalizeError } from "@dust-tt/client";

export function normalizeAsInternalDustError(
  error: unknown
): DustError<"internal_error"> {
  if (error instanceof DustError && error.code === "internal_error") {
    return error;
  }

  return new DustError("internal_error", errorToString(error));
}
