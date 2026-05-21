/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { getRegisteredImages } from "@app/lib/api/sandbox/image";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export interface SandboxKillImagesResponseBody {
  images: Array<{ baseImage: string; version: string }>;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SandboxKillImagesResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
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

  const images = getRegisteredImages()
    .map((image) => image.imageId)
    .filter((id): id is { imageName: string; tag: string } => id !== undefined)
    .map(({ imageName, tag }) => ({ baseImage: imageName, version: tag }));

  return res.status(200).json({ images });
}

export default withSessionAuthenticationForPoke(handler);
