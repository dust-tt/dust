import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SkillSuggestionState } from "@app/types/suggestions/skill_suggestion";

/**
 * This is used to change state of reinforcement suggestion, which is the only place where we use
 * individual skill suggestions in the product. These are wrapped into a batch suggestion (as an
 * easy way to display them in a conversation like other batch suggestions). The batch must always
 * have a single suggestion.
 */
/**
 * @cc [owner:fabiencelier,label:product] batched-suggestions-reviewed-through-batch
 * Suggestions that belong to a batch MUST change state through their batch, the others
 * individually, all in a single transaction. When a batch has a member (agent or skill suggestion)
 * that is not among `suggestions`, it MUST fail with `invalid_request_error` without updating
 * anything.
 */
export async function updateSkillSuggestionsState(
  auth: Authenticator,
  suggestions: SkillSuggestionResource[],
  state: SkillSuggestionState
): Promise<Result<undefined, DustError<"invalid_request_error">>> {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const batchModelIds = [
    ...new Set(removeNulls(suggestions.map((s) => s.batchId))),
  ];
  const batches = await BatchSuggestionResource.fetchByIds(
    auth,
    batchModelIds.map((id) =>
      BatchSuggestionResource.modelIdToSId({ id, workspaceId })
    )
  );

  const suggestionIds = new Set(suggestions.map((s) => s.sId));
  const isFullyIncluded = (batch: BatchSuggestionResource) =>
    batch.agentSuggestions.length === 0 &&
    batch.skillSuggestions.every((s) => suggestionIds.has(s.sId));
  if (
    batches.length !== batchModelIds.length ||
    !batches.every(isFullyIncluded)
  ) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Skill suggestions that belong to a batch must be reviewed together with the rest of their batch."
      )
    );
  }

  await withTransaction(async (transaction) => {
    await SkillSuggestionResource.bulkUpdateState(
      auth,
      suggestions.filter((s) => s.batchId === null),
      state,
      { transaction }
    );
    for (const batch of batches) {
      await batch.updateState(auth, state, { transaction });
    }
  });

  return new Ok(undefined);
}
