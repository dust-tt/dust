import type { GetSpaceMetadataResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 * Used by connectors to fetch project metadata for syncing to data sources.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSpaceMetadataResponseType>>,
  auth: Authenticator
): Promise<void> {
  const { wId, spaceId } = req.query;
  if (!isString(wId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid workspace id.",
      },
    });
  }
  if (!isString(spaceId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid space id.",
      },
    });
  }

  // Only allow system keys (connectors) to access this endpoint
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      // Fetch and verify space exists
      const space = await SpaceResource.fetchById(auth, spaceId);
      if (!space) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "space_not_found",
            message: "Space not found.",
          },
        });
      }

      // Only project spaces can have metadata
      if (!space.isProject()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Project metadata is only available for project spaces.",
          },
        });
      }

      // Fetch metadata
      const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);

      return res.status(200).json({
        metadata: metadata ? metadata.toJSON() : null,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
