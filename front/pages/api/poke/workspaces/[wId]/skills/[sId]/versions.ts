import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@app/logger/withlogging";
import type { SkillWithVersionType } from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeGetSkillVersions = {
  versions: SkillWithVersionType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetSkillVersions>>,
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
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const skill = await SkillResource.fetchById(auth, sId);

      if (!skill) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "skill_not_found",
            message: "Skill not found.",
          },
        });
      }

      const versions = await skill.listVersions(auth);

      return res.status(200).json({
        versions: versions.map((v) => ({
          ...v.toJSON(auth),
          version: v.version,
        })),
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
