import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getBuilderSuggestions } from "@app/lib/api/assistant/suggestions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type {
  BuilderEmojiSuggestionsType,
  BuilderSuggestionsType,
  WithAPIErrorResponse,
} from "@app/types";
import { InternalPostBuilderSuggestionsRequestBodySchema } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<BuilderSuggestionsType | BuilderEmojiSuggestionsType>
  >,
  auth: Authenticator
): Promise<void> {
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

      const suggestionsRes = await getBuilderSuggestions(
        auth,
        suggestionsType,
        suggestionsInputs
      );
      if (suggestionsRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: suggestionsRes.error.message,
          },
        });
      }

      return res.status(200).json(suggestionsRes.value);

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
