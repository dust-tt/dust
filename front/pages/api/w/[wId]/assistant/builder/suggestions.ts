import type {
  BuilderEmojiSuggestionsType,
  BuilderSuggestionsType,
  ModelConfigurationType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import {
  assertNever,
  BuilderEmojiSuggestionsResponseBodySchema,
  BuilderSuggestionsResponseBodySchema,
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  InternalPostBuilderSuggestionsRequestBodySchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { runAction } from "@app/lib/actions/server";
import { filterSuggestedNames } from "@app/lib/api/assistant/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, DustProdActionRegistry } from "@app/lib/registry";
import { apiError } from "@app/logger/withlogging";

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
        case "name":
        case "description":
        case "emoji":
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
        DustProdActionRegistry[
          `assistant-builder-${suggestionsType}-suggestions`
        ].config
      );
      config.CREATE_SUGGESTIONS.provider_id = model.providerId;
      config.CREATE_SUGGESTIONS.model_id = model.modelId;

      const suggestionsResponse = await runAction(
        auth,
        `assistant-builder-${suggestionsType}-suggestions`,
        config,
        [suggestionsInputs]
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
      };
      if (suggestionsType === "name") {
        suggestions.suggestions = await filterSuggestedNames(
          owner,
          suggestions.suggestions
        );
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
