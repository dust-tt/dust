/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { readInteractiveContentFile } from "@app/lib/api/files/read";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type {
  FileShareScope,
  FileTypeWithMetadata,
  SharingGrantType,
} from "@app/types/files";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export interface GetPokeFileResponseBody {
  content: string;
  file: FileTypeWithMetadata;
  shareInfo: {
    scope: FileShareScope;
    sharedAt: Date;
    shareUrl: string;
  } | null;
  sharingGrants: SharingGrantType[];
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
    case "GET": {
      const result = await readInteractiveContentFile(auth, sId);
      if (result.isErr()) {
        const err = result.error;
        switch (err) {
          case "file_not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "file_not_found",
                message: "File not found.",
              },
            });
          case "not_interactive_content":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "Only interactive content files can be viewed.",
              },
            });
          default:
            return assertNever(err);
        }
      }

      return res.status(200).json(result.value);
    }

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
