import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import {
  type GCSMountEntry,
  getConversationFileMountSignedUrl,
  getGCSPathFromScopedPath,
  listGCSMountFiles,
} from "@app/lib/api/files/gcs_mount/files";
import { getProjectFilesBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetSpaceGCSMountFilesResponseType = {
  files: GCSMountEntry[];
};

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSpaceGCSMountFilesResponseType>>,
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

      if (!space.isProject()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "GCS mount files listing is only available for project spaces.",
          },
        });
      }

      const { updatedSince } = req.query;
      const updatedSinceMs = isString(updatedSince)
        ? parseInt(updatedSince, 10)
        : null;
      const updatedSinceFilter =
        updatedSinceMs !== null && !Number.isNaN(updatedSinceMs)
          ? updatedSinceMs
          : null;

      let files = await listGCSMountFiles(auth, {
        useCase: "project",
        projectId: space.sId,
      });

      if (updatedSinceFilter !== null) {
        files = files.filter((e) => e.lastModifiedMs >= updatedSinceFilter);
      }

      const owner = auth.getNonNullableWorkspace();
      const gcsPrefix = getProjectFilesBasePath({
        workspaceId: owner.sId,
        projectId: space.sId,
      });

      const filesWithSignedUrls = await concurrentExecutor(
        files,
        async (entry) => {
          if (entry.isDirectory) {
            return entry;
          }
          const gcsPath = getGCSPathFromScopedPath({
            prefix: gcsPrefix,
            scopedPath: entry.path,
            useCase: "project",
          });
          if (!gcsPath) {
            return { ...entry, signedDownloadUrl: null };
          }
          const signed = await getConversationFileMountSignedUrl(
            auth,
            { useCase: "project", projectId: space.sId },
            gcsPath
          );
          return {
            ...entry,
            signedDownloadUrl: signed.isOk() ? signed.value : null,
          };
        },
        { concurrency: 8 }
      );

      return res.status(200).json({ files: filesWithSignedUrls });
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

export default withPublicAPIAuthentication(handler);
