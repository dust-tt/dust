import type {
  BuilderEmojiSuggestionsType,
  BuilderSuggestionsType,
  ModelConfigurationType,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import {
  assertNever,
  BuilderEmojiSuggestionsResponseBodySchema,
  BuilderSuggestionsResponseBodySchema,
  cloneBaseConfig,
  DustProdActionRegistry,
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  InternalPostBuilderSuggestionsRequestBodySchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { runAction } from "@app/lib/actions/server";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<BuilderSuggestionsType | BuilderEmojiSuggestionsType>
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );
  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message:
          "Workspace not found or user not authenticated to this workspace.",
      },
    });
  }

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
      const suggestions = responseValidation.right;
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

export default withLogging(handler);
