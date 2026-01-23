import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
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
      const { name, userFacingDescription, agentFacingDescription, instructions, icon } =
        req.body;

      if (!isString(name) || !name.trim()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Name is required.",
          },
        });
      }

      const result = await SkillResource.makeSuggestion(
        auth,
        {
          name: name.trim(),
          userFacingDescription: isString(userFacingDescription)
            ? userFacingDescription.trim()
            : "",
          agentFacingDescription: isString(agentFacingDescription)
            ? agentFacingDescription.trim()
            : "",
          instructions: isString(instructions) ? instructions.trim() : "",
          icon: isString(icon) && icon.trim() ? icon.trim() : null,
          extendedSkillId: null,
        },
        {
          // No MCP servers for suggested skills created through poke.
          mcpServerNames: [],
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
