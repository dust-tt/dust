import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Applies every suggestion of a batch to the agents and skills they target.
 */
export async function applyBatchSuggestions(
  auth: Authenticator,
  batch: BatchSuggestionResource
): Promise<Result<undefined, DustError<"invalid_request_error">>> {
  // TODO: order, validate and apply the batch's suggestions.
  return new Ok(undefined);
}
