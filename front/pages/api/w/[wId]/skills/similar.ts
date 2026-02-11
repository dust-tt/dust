import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getSimilarSkills } from "@app/lib/api/skills/existing_skill_checker";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";

export type GetSimilarSkillsResponseBody = {
  similar_skills: string[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSimilarSkillsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "POST": {
      const { naturalDescription, excludeSkillId } = req.body;

      if (!isString(naturalDescription)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "naturalDescription is required and must be a string.",
          },
        });
      }

      if (excludeSkillId !== undefined && !isString(excludeSkillId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "excludeSkillId must be a string if provided.",
          },
        });
      }

      const result = await getSimilarSkills(auth, {
        naturalDescription,
        excludeSkillId: excludeSkillId ?? null,
      });

      if (result.isErr()) {
        logger.error(
          { error: result.error, workspaceId: owner.sId },
          "Error fetching similar skills"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }
      const similarSkills = result.value.similar_skills;
      if (similarSkills.length > 0) {
        logger.info(
          {
            workspaceId: owner.sId,
            naturalDescription: naturalDescription,
            similarSkills: similarSkills,
          },
          `Successfully fetched ${similarSkills.length} similar skills`
        );
      } else {
        logger.info(
          {
            workspaceId: owner.sId,
            naturalDescription: naturalDescription,
          },
          "No similar skills found"
        );
      }

      return res.status(200).json(result.value);
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
