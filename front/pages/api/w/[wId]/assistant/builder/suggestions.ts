import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { runAction } from "@app/lib/actions/server";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { cloneBaseConfig, getDustProdActionRegistry } from "@app/lib/registry";
import { apiError } from "@app/logger/withlogging";
import type {
  BuilderEmojiSuggestionsType,
  BuilderSuggestionsType,
  ModelConfigurationType,
  WithAPIErrorResponse,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  BuilderEmojiSuggestionsResponseBodySchema,
  BuilderSuggestionsResponseBodySchema,
  GEMINI_2_FLASH_MODEL_CONFIG,
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  InternalPostBuilderSuggestionsRequestBodySchema,
} from "@app/types";

// Minimum number of suggestions output by the suggestion app.
const SUGGESTIONS_MIN_COUNT = 8;
// Maximum number of suggestions output by the suggestion app.
const SUGGESTIONS_MAX_COUNT = 16;
// Maximum length of each suggestion, in number of characters.
const SUGGESTION_MAX_LENGTH = 100;

// Threshold on the score output by the suggestion app at which we consider the instructions
// to be good enough and not require any additional suggestions.
const SCORE_THRESHOLD = 50;

async function filterSuggestedNames(
  owner: WorkspaceType,
  suggestions: string[] | undefined | null
) {
  if (!suggestions || suggestions.length === 0) {
    return [];
  }
  // Filter out suggested names that are already in use in the workspace.
  const existingNames = (
    await AgentConfiguration.findAll({
      where: {
        workspaceId: owner.id,
        status: "active",
      },
      attributes: ["name"],
    })
  ).map((ac) => ac.name.toLowerCase());

  return suggestions?.filter((s) => !existingNames.includes(s.toLowerCase()));
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<BuilderSuggestionsType | BuilderEmojiSuggestionsType>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "POST":
      const bodyValidation =
        InternalPostBuilderSuggestionsRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const suggestionsType = bodyValidation.right.type;
      const suggestionsInputs = bodyValidation.right.inputs;

      let model: ModelConfigurationType | null = null;
      switch (suggestionsType) {
        case "instructions":
          model = getLargeWhitelistedModel(owner);
          break;
        case "autocompletion":
          model = GEMINI_2_FLASH_MODEL_CONFIG;
          break;
        case "name":
        case "description":
        case "emoji":
        case "tags":
          model = getSmallWhitelistedModel(owner);
          break;
        default:
          assertNever(suggestionsType);
      }

      if (!model) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `No whitelisted models were found for the workspace.`,
          },
        });
      }

      const config = cloneBaseConfig(
        getDustProdActionRegistry()[
          `assistant-builder-${suggestionsType}-suggestions`
        ].config
      );
      config.CREATE_SUGGESTIONS.provider_id = model.providerId;
      config.CREATE_SUGGESTIONS.model_id = model.modelId;
      const additionalConfiguration = {
        minSuggestionCount: SUGGESTIONS_MIN_COUNT,
        maxSuggestionCount: SUGGESTIONS_MAX_COUNT,
        maxSuggestionLength: SUGGESTION_MAX_LENGTH,
      };

      const suggestionsResponse = await runAction(
        auth,
        `assistant-builder-${suggestionsType}-suggestions`,
        config,
        [{ ...suggestionsInputs, ...additionalConfiguration }]
      );

      if (suggestionsResponse.isErr() || !suggestionsResponse.value.results) {
        const message = suggestionsResponse.isErr()
          ? JSON.stringify(suggestionsResponse.error)
          : "No results available";
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message,
          },
        });
      }

      const responseValidation = t
        .union([
          BuilderSuggestionsResponseBodySchema,
          BuilderEmojiSuggestionsResponseBodySchema,
        ])
        .decode(suggestionsResponse.value.results[0][0].value);
      if (isLeft(responseValidation)) {
        const pathError = reporter.formatValidationErrors(
          responseValidation.left
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Invalid response from action: ${pathError}`,
          },
        });
      }
      const suggestions = responseValidation.right as {
        status: "ok";
        suggestions: string[] | null | undefined;
        score: number | null | undefined;
      };
      if (suggestionsType === "name") {
        suggestions.suggestions = await filterSuggestedNames(
          owner,
          suggestions.suggestions
        );
      }
      if (
        typeof suggestions.score === "number" &&
        suggestions.score > SCORE_THRESHOLD
      ) {
        return res.status(200).json({ ...suggestions, suggestions: [] });
      }

      return res.status(200).json(suggestions);

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
