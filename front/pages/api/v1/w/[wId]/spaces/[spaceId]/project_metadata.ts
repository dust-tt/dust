import type { GetSpaceMetadataResponseType } from "@dust-tt/client";
import uniqBy from "lodash/uniqBy";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";

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
      // shouldn't happen, as we create the metadata row when we create the project, but just in case
      if (!metadata) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "project_metadata_not_found",
            message: "Project metadata not found for this space.",
          },
        });
      }

      // Fetch current members of the project
      const memberUsers = uniqBy(
        (
          await concurrentExecutor(
            space.groups,
            (group) => group.getActiveMembers(auth),
            { concurrency: 2 }
          )
        ).flat(),
        "sId"
      );

      // Format members with mention syntax
      const formattedMembers = memberUsers.map((user) =>
        serializeMention({
          id: user.sId,
          type: "user",
          label: user.fullName() || user.email,
        })
      );

      return res.status(200).json({
        metadata: { ...metadata.toJSON(), members: formattedMembers },
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
