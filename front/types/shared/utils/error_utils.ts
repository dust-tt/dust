import { DustError } from "@app/lib/error";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { errorToString } from "@dust-tt/client";

// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
export { errorToString, normalizeError } from "@dust-tt/client";

export function normalizeAsInternalDustError(
  error: unknown
): DustError<"internal_error"> {
  if (error instanceof DustError && error.code === "internal_error") {
    return error;
  }

  return new DustError("internal_error", errorToString(error));
}
