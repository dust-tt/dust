/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeGetSkillSuggestionDetails = {
  suggestion: SkillSuggestionType;
  skillInstructionsHtml: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetSkillSuggestionDetails>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, suggestionId } = req.query;
  if (!isString(wId) || !isString(suggestionId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or suggestion ID.",
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
        message: "Workspace not found.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const suggestion = await SkillSuggestionResource.fetchById(
    auth,
    suggestionId
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

  const skill = await SkillResource.fetchById(
    auth,
    suggestion.skillConfigurationSId
  );

  return res.status(200).json({
    suggestion: suggestion.toJSON(),
    skillInstructionsHtml: skill?.toJSON(auth).instructionsHtml ?? null,
  });
}

export default withSessionAuthenticationForPoke(handler);
