import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { runAction } from "@app/lib/actions/server";
import { getBuilderDescriptionSuggestions } from "@app/lib/api/assistant/suggestions/description";
import { getBuilderNameSuggestions } from "@app/lib/api/assistant/suggestions/name";
import type { SuggestionResults } from "@app/lib/api/assistant/suggestions/types";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdActionRegistry } from "@app/lib/registry";
import type {
  BuilderSuggestionInputType,
  BuilderSuggestionType,
  ModelConfigurationType,
  Result,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  BuilderEmojiSuggestionsResponseBodySchema,
  BuilderSuggestionsResponseBodySchema,
  Err,
  GEMINI_2_FLASH_MODEL_CONFIG,
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  Ok,
} from "@app/types";

// Minimum number of suggestions output by the suggestion app.
const SUGGESTIONS_MIN_COUNT = 8;
// Maximum number of suggestions output by the suggestion app.
const SUGGESTIONS_MAX_COUNT = 16;
// Maximum length of each suggestion, in number of characters.
const SUGGESTION_MAX_LENGTH = 100;

function getModelForSuggestionType(
  owner: WorkspaceType,
  type: BuilderSuggestionType
): ModelConfigurationType | null {
  switch (type) {
    case "instructions":
      return getLargeWhitelistedModel(owner);

    case "autocompletion":
      return GEMINI_2_FLASH_MODEL_CONFIG;

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

    case "emoji":
    case "tags":
    case "instructions":
    case "autocompletion": {
      const config = cloneBaseConfig(
        getDustProdActionRegistry()[`assistant-builder-${type}-suggestions`]
          .config
      );
      config.CREATE_SUGGESTIONS.provider_id = model.providerId;
      config.CREATE_SUGGESTIONS.model_id = model.modelId;
      const additionalConfiguration = {
        minSuggestionCount: SUGGESTIONS_MIN_COUNT,
        maxSuggestionCount: SUGGESTIONS_MAX_COUNT,
        maxSuggestionLength: SUGGESTION_MAX_LENGTH,
      };

      const suggestionsRes = await runAction(
        auth,
        `assistant-builder-${type}-suggestions`,
        config,
        [{ ...inputs, ...additionalConfiguration }]
      );

      if (suggestionsRes.isErr() || !suggestionsRes.value.results) {
        const message = suggestionsRes.isErr()
          ? JSON.stringify(suggestionsRes.error)
          : "No results available";

        return new Err(new Error(message));
      }

      const responseValidation = t
        .union([
          BuilderSuggestionsResponseBodySchema,
          BuilderEmojiSuggestionsResponseBodySchema,
        ])
        .decode(suggestionsRes.value.results[0][0].value);
      if (isLeft(responseValidation)) {
        const pathError = reporter.formatValidationErrors(
          responseValidation.left
        );

        return new Err(new Error(`Invalid response from action: ${pathError}`));
      }

      const suggestions = responseValidation.right as {
        status: "ok";
        suggestions: string[] | null | undefined;
        score: number | null | undefined;
      };

      return new Ok({
        status: suggestions.status,
        suggestions: suggestions.suggestions,
        score: suggestions.score,
      });
    }

    default:
      assertNever(type);
  }
}
