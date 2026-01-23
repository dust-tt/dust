import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export type PostPokeSkillSuggestionResponseBody = {
  skill: SkillType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostPokeSkillSuggestionResponseBody | void>
  >,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (!isString(wId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to access was not found.",
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
        message: "The workspace you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const {
        name,
        userFacingDescription,
        agentFacingDescription,
        instructions,
        icon,
        mcpServerNames,
      } = bodyResult.data;

      if (!isString(userFacingDescription) || !userFacingDescription.trim()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Description is required.",
          },
        });
      }

      if (!isString(agentFacingDescription) || !agentFacingDescription.trim()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "What will this skill be used for is required.",
          },
        });
      }

      if (!isString(instructions) || !instructions.trim()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Instructions are required.",
          },
        });
      }

      const trimmedName = name.trim();
      const trimmedUserFacingDescription = userFacingDescription.trim();
      const trimmedAgentFacingDescription = agentFacingDescription.trim();
      const trimmedInstructions = instructions.trim();

      let skillIcon: string | null =
        isString(icon) && icon.trim() ? icon.trim() : null;

      if (!skillIcon) {
        const iconSuggestionResult = await getSkillIconSuggestion(auth, {
          name,
          agentFacingDescription,
          instructions,
        });
        if (iconSuggestionResult.isOk()) {
          skillIcon = iconSuggestionResult.value;
        }
      }

      const result = await SkillResource.makeSuggestion(
        auth,
        {
          name,
          userFacingDescription,
          agentFacingDescription,
          instructions,
          icon: skillIcon,
          extendedSkillId: null,
        },
        {
          mcpServerNames,
        }
      );

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to create skill suggestion: ${result.error.message}`,
          },
        });
      }

      return res.status(201).json({
        skill: result.value.toJSON(auth),
      });
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

export default withSessionAuthenticationForPoke(handler);
