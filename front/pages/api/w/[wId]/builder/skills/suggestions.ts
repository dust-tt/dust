/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { SkillDescriptionSuggestionInputs } from "@app/lib/api/skills/description_suggestion";
import {
  getSkillDescriptionSuggestion,
  PostSkillSuggestionsRequestBodySchema,
} from "@app/lib/api/skills/description_suggestion";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

type SkillSuggestionsResponseType = {
  suggestion: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SkillSuggestionsResponseType>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST": {
      const bodyValidation = PostSkillSuggestionsRequestBodySchema.safeParse(
        req.body
      );
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const inputs: SkillDescriptionSuggestionInputs = bodyValidation.data;

      const suggestionRes = await getSkillDescriptionSuggestion(auth, inputs);
      if (suggestionRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: suggestionRes.error.message,
          },
        });
      }

      return res.status(200).json({ suggestion: suggestionRes.value });
    }

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
