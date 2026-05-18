/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  getProjectFilesBasePath,
  parseScopedFilePath,
} from "@app/lib/api/files/mount_path";
import {
  deleteProjectFile,
  renameProjectFile,
} from "@app/lib/api/projects/context";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

export type ProjectFileRelResponseBody = Record<string, never>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ProjectFileRelResponseBody>>,
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

  const { rel } = req.query;
  if (!Array.isArray(rel) || rel.length === 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing file path.",
      },
    });
  }

  const scopedPath = parseScopedFilePath(rel.join("/"));
  if (!scopedPath || scopedPath.prefix !== "project") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Path must start with the scope prefix `project/`.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const basePath = getProjectFilesBasePath({
    workspaceId: owner.sId,
    projectId: space.sId,
  });
  const normalizedGcsPath = path.posix.normalize(
    `${basePath}${scopedPath.rel}`
  );
  if (!normalizedGcsPath.startsWith(basePath)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside project scope.",
      },
    });
  }
  const normalizedRelative = scopedPath.rel;

  switch (req.method) {
    case "GET": {
      const gcsPath = normalizedGcsPath;

      const bucket = getPrivateUploadBucket();
      const contentTypeResult = await bucket.getFileContentType(gcsPath);
      if (contentTypeResult.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "file_not_found",
            message: "File not found.",
          },
        });
      }

      const contentType = contentTypeResult.value ?? "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      const readStream = bucket.file(gcsPath).createReadStream();
      readStream.on("error", (err) => {
        logger.error({ err, gcsPath }, "Error streaming project file (GCS)");
        readStream.destroy();
        res.end();
      });
      readStream.pipe(res);
      return;
    }

    case "PATCH": {
      if (!space.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "You do not have write access to this project.",
          },
        });
      }

      const { fileName } = req.body;
      if (
        !isString(fileName) ||
        fileName.trim() === "" ||
        fileName.includes("/") ||
        fileName.includes("\\")
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "fileName is required and must be a non-empty string without path separators.",
          },
        });
      }

      const renameResult = await renameProjectFile(auth, {
        space,
        relativeFilePath: normalizedRelative,
        newFileName: fileName.trim(),
      });
      if (renameResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: renameResult.error.message,
          },
        });
      }

      return res.status(200).json({});
    }

    case "DELETE": {
      if (!space.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "You do not have write access to this project.",
          },
        });
      }

      const deleteResult = await deleteProjectFile(auth, {
        space,
        relativeFilePath: normalizedRelative,
      });
      if (deleteResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: deleteResult.error.message,
          },
        });
      }

      return res.status(200).json({});
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Only GET, PATCH and DELETE methods are supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
