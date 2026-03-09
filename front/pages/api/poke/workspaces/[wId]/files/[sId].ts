import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { FileTypeWithMetadata } from "@app/types/files";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export interface GetPokeFileResponseBody {
  content: string;
  file: FileTypeWithMetadata;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetPokeFileResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const { sId, wId } = req.query;
  if (!isString(wId)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (!isString(sId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The sId parameter is required.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const file = await FileResource.fetchById(auth, sId);
      if (!file) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "file_not_found",
            message: "File not found.",
          },
        });
      }

      // Only allow access to interactive content files (frames).
      if (!file.isInteractiveContent) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Only interactive content files can be viewed.",
          },
        });
      }

      const readStream = file.getReadStream({ auth, version: "original" });
      const chunks: Buffer[] = [];
      for await (const chunk of readStream) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks).toString("utf-8");

      return res.status(200).json({
        file: file.toJSONWithMetadata(auth),
        content,
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
