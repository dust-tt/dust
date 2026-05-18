/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  type GCSMountEntry,
  type GCSMountFileEntry,
  listGCSMountFiles,
} from "@app/lib/api/files/gcs_mount/files";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type { GCSMountEntry, GCSMountFileEntry };

export type GetSpaceFilesResponseBody = {
  files: GCSMountEntry[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSpaceFilesResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET method is supported.",
      },
    });
  }

  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Files are only available for project spaces.",
      },
    });
  }

  const files = await listGCSMountFiles(auth, {
    useCase: "project",
    projectId: space.sId,
  });

  return res.status(200).json({ files });
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
