import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@app/logger/withlogging";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const PostSkillSuggestionBodySchema = z.object({
  name: z.string().min(1, "Name is required."),
  userFacingDescription: z.string().min(1, "Description is required."),
  agentFacingDescription: z
    .string()
    .min(1, "What will this skill be used for is required."),
  instructions: z.string().min(1, "Instructions are required."),
  icon: z.string().nullable(),
  mcpServerViewIds: z.array(z.string()),
});

export type PostSkillSuggestionBodyType = z.infer<
  typeof PostSkillSuggestionBodySchema
>;

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
        type: "invalid_request_error",
        message: "Missing or invalid workspace id.",
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
      const bodyResult = PostSkillSuggestionBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: bodyResult.error.errors[0]?.message ?? "Invalid request.",
          },
        });
      }

      const {
        name,
        userFacingDescription,
        agentFacingDescription,
        instructions,
        icon,
        mcpServerViewIds,
      } = bodyResult.data;

      let skillIcon = icon;

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
          mcpServerViewIds,
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
