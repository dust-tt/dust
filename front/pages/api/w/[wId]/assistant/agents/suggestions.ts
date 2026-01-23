import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";

const ALLOWED_PATCH_STATES = ["approved", "declined", "outdated"] as const;

const PatchSuggestionRequestBodySchema = t.type({
  suggestionId: t.string,
  state: t.keyof(
    Object.fromEntries(ALLOWED_PATCH_STATES.map((s) => [s, null])) as Record<
      (typeof ALLOWED_PATCH_STATES)[number],
      null
    >
  ),
});

export type PatchSuggestionRequestBody = t.TypeOf<
  typeof PatchSuggestionRequestBodySchema
>;

export interface PatchSuggestionResponseBody {
  suggestion: AgentSuggestionType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchSuggestionResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "PATCH": {
      const bodyValidation = PatchSuggestionRequestBodySchema.decode(req.body);
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

      const { suggestionId, state } = bodyValidation.right;

      const suggestion = await AgentSuggestionResource.fetchById(
        auth,
        suggestionId
      );
      if (!suggestion) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_suggestion_not_found",
            message: "The agent suggestion was not found.",
          },
        });
      }

      if (!suggestion.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "agent_group_permission_error",
            message:
              "Only editors of the agent or workspace admins can modify suggestions.",
          },
        });
      }

      await suggestion.updateState(auth, state);

      // Fetch the updated suggestion to return the latest state.
      const updatedSuggestion = await AgentSuggestionResource.fetchById(
        auth,
        suggestionId
      );
      if (!updatedSuggestion) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to fetch updated suggestion.",
          },
        });
      }

      return res.status(200).json({ suggestion: updatedSuggestion.toJSON() });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
