import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { SkillDescriptionSuggestionInputs } from "@app/lib/api/skill/suggestions";
import { getSkillDescriptionSuggestion } from "@app/lib/api/skill/suggestions";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const PostSkillSuggestionsRequestBodySchema = t.type({
  instructions: t.string,
  agentFacingDescription: t.string,
  tools: t.array(t.type({ name: t.string, description: t.string })),
});
export type PostSkillSuggestionsRequestBody = t.TypeOf<
  typeof PostSkillSuggestionsRequestBodySchema
>;

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
      const bodyValidation = PostSkillSuggestionsRequestBodySchema.decode(
        req.body
      );
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

      const inputs: SkillDescriptionSuggestionInputs = bodyValidation.right;

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
