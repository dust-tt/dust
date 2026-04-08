/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { SKILL_SUGGESTION_SOURCES } from "@app/types/suggestions/skill_suggestion";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeListSkillSuggestions = {
  suggestions: SkillSuggestionType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListSkillSuggestions>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, sId } = req.query;
  if (!isString(wId) || !isString(sId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or skill ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  const owner = auth.workspace();
  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const suggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(auth, sId, {
          sources: [...SKILL_SUGGESTION_SOURCES],
        });

      return res.status(200).json({
        suggestions: suggestions.map((s) => s.toJSON()),
      });
    }

    case "DELETE": {
      const { suggestionSId } = req.query;
      if (!isString(suggestionSId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The suggestion ID is required.",
          },
        });
      }

      const suggestion = await SkillSuggestionResource.fetchById(
        auth,
        suggestionSId
      );
      if (!suggestion) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "skill_not_found",
            message: "The suggestion was not found.",
          },
        });
      }

      const deleteResult = await suggestion.delete(auth);
      if (deleteResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete suggestion.",
          },
        });
      }

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
