/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  type GCSMountDirectoryEntry,
  type GCSMountEntry,
  type GCSMountFileEntry,
  listGCSMountFiles,
} from "@app/lib/api/files/gcs_mount/files";
import { createProjectFolder } from "@app/lib/api/projects/context";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type { GCSMountDirectoryEntry, GCSMountEntry, GCSMountFileEntry };

export type GetSpaceFilesResponseBody = {
  files: GCSMountEntry[];
};

export type PostSpaceFolderResponseBody = {
  folder: GCSMountDirectoryEntry;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetSpaceFilesResponseBody | PostSpaceFolderResponseBody
    >
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Files are only available for project spaces.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const files = await listGCSMountFiles(auth, {
        useCase: "project",
        projectId: space.sId,
      });

      return res.status(200).json({ files });
    }

    case "POST": {
      if (!space.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "You do not have write access to this project.",
          },
        });
      }

      const { folderName, parentRelativePath } = req.body ?? {};
      if (!isString(folderName)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "folderName is required and must be a non-empty string without path separators.",
          },
        });
      }

      if (parentRelativePath !== undefined && !isString(parentRelativePath)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "parentRelativePath must be a string when provided.",
          },
        });
      }

      const createResult = await createProjectFolder(auth, {
        space,
        folderName,
        parentRelativePath,
      });
      if (createResult.isErr()) {
        const message = createResult.error.message;
        const status_code = message === "Folder already exists." ? 409 : 400;
        return apiError(req, res, {
          status_code,
          api_error: {
            type: "invalid_request_error",
            message,
          },
        });
      }

      return res.status(201).json({ folder: createResult.value });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Only GET and POST methods are supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
