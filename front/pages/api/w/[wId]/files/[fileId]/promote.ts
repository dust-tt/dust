import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { promoteFrameToProject } from "@app/lib/api/files/promotion";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";

export type PromoteFrameResponseBody = {
  frameNodeId: string;
  dataSourceId: string;
  movedFiles: string[];
};

/**
 * POST /api/w/{wId}/files/{fileId}/promote
 *
 * Promotes a frame (Interactive Content) and its dependent files from a conversation
 * to a project space, making them searchable and globally available.
 *
 * Body: { spaceId: string }
 *
 * Response: {
 *   frameNodeId: string,
 *   dataSourceId: string,
 *   movedFiles: string[]
 * }
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PromoteFrameResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  if (!featureFlags.includes("projects")) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Feature not supported",
      },
    });
  }

  const { fileId } = req.query;
  if (!isString(fileId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing fileId query parameter.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const { spaceId } = req.body;
      if (!isString(spaceId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "spaceId is required and must be a string.",
          },
        });
      }

      const result = await promoteFrameToProject(auth, fileId, spaceId);

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: result.error.message,
          },
        });
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
