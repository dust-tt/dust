/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<never>>,
  auth: Authenticator
): Promise<void> {
  const { sId: skillId, fileId } = req.query;

  if (!isString(skillId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  if (!isString(fileId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid file ID.",
      },
    });
  }

  const skill = await SkillResource.fetchById(auth, skillId);
  if (!skill) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const file = await FileResource.fetchById(auth, fileId);
  if (
    !file ||
    file.useCase !== "skill_attachment" ||
    file.useCaseMetadata?.skillId !== skillId
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      res.setHeader("Content-Type", file.contentType);

      const readStream = file.getReadStream({ auth, version: "original" });
      readStream.on("error", (err) => {
        logger.error({ err, fileId }, "Error streaming skill attachment file");
        readStream.destroy();
        res.end();
      });
      readStream.pipe(res);
      return;

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

export default withSessionAuthenticationForWorkspace(handler);
