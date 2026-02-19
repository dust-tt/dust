import { getBuilderDescriptionSuggestions } from "@app/lib/api/assistant/suggestions/description";
import { getBuilderEmojiSuggestions } from "@app/lib/api/assistant/suggestions/emoji";
import { getBuilderInstructionsSuggestions } from "@app/lib/api/assistant/suggestions/instructions";
import { getBuilderNameSuggestions } from "@app/lib/api/assistant/suggestions/name";
import { getBuilderTagSuggestions } from "@app/lib/api/assistant/suggestions/tags";
import type { SuggestionResults } from "@app/lib/api/assistant/suggestions/types";
import type { Authenticator } from "@app/lib/auth";
import type {
  BuilderSuggestionInputType,
  BuilderSuggestionType,
} from "@app/types/api/internal/assistant";
import { getSmallWhitelistedModel } from "@app/types/assistant/assistant";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";

function getModelForSuggestionType(
  owner: WorkspaceType,
  type: BuilderSuggestionType
): ModelConfigurationType | null {
  switch (type) {
    case "instructions":
    case "name":
    case "description":
    case "emoji":
    case "tags":
      return getSmallWhitelistedModel(owner);

    default:
      assertNever(type);
  }
}

export async function getBuilderSuggestions(
  auth: Authenticator,
  type: BuilderSuggestionType,
  inputs: BuilderSuggestionInputType
): Promise<Result<SuggestionResults, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getModelForSuggestionType(owner, type);
  if (!model) {
    return new Err(
      new Error("No whitelisted models were found for the workspace.")
    );
  }

  switch (type) {
    case "name":
      return getBuilderNameSuggestions(auth, inputs);

    case "description":
      return getBuilderDescriptionSuggestions(auth, inputs);

    case "tags":
      return getBuilderTagSuggestions(auth, inputs);

    case "emoji":
      return getBuilderEmojiSuggestions(auth, inputs);

    case "instructions":
      return getBuilderInstructionsSuggestions(auth, inputs);

    default:
      assertNever(type);
  }
}
