/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  getProjectFilesBasePath,
  isResolveMountFilePathError,
  resolveScopedMountFilePath,
} from "@app/lib/api/files/mount_path";
import { MoveMountFileRequestBodySchema } from "@app/lib/api/files/mount_schemas";
import {
  deleteProjectFile,
  moveProjectFile,
  renameProjectFile,
} from "@app/lib/api/projects/context";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

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

  const owner = auth.getNonNullableWorkspace();
  const mountBasePath = getProjectFilesBasePath({
    workspaceId: owner.sId,
    projectId: space.sId,
  });
  const relPath = rel.join("/");

  const resolveScopedPath = () =>
    resolveScopedMountFilePath({
      relPath,
      expectedPrefix: "project",
      mountBasePath,
      outsideScopeMessage: "Access denied: path is outside project scope.",
    });

  switch (req.method) {
    case "GET": {
      const pathRes = resolveScopedPath();
      if (pathRes.isErr()) {
        const { code, message } = pathRes.error;
        return apiError(req, res, {
          status_code: code === "outside_scope" ? 403 : 400,
          api_error: {
            type:
              code === "outside_scope"
                ? "workspace_auth_error"
                : "invalid_request_error",
            message,
          },
        });
      }
      const gcsPath = pathRes.value.normalizedGcsPath;

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

      const pathRes = resolveScopedPath();
      if (pathRes.isErr()) {
        const { code, message } = pathRes.error;
        return apiError(req, res, {
          status_code: code === "outside_scope" ? 403 : 400,
          api_error: {
            type:
              code === "outside_scope"
                ? "workspace_auth_error"
                : "invalid_request_error",
            message,
          },
        });
      }
      const { normalizedRelative } = pathRes.value;

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

      const pathRes = resolveScopedPath();
      if (pathRes.isErr()) {
        const { code, message } = pathRes.error;
        return apiError(req, res, {
          status_code: code === "outside_scope" ? 403 : 400,
          api_error: {
            type:
              code === "outside_scope"
                ? "workspace_auth_error"
                : "invalid_request_error",
            message,
          },
        });
      }
      const { normalizedRelative } = pathRes.value;

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

      const bodyValidation = MoveMountFileRequestBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
          },
        });
      }

      const moveResult = await moveProjectFile(auth, {
        space,
        sourcePath: relPath,
        destRelativeFilePath: bodyValidation.data.destRelativeFilePath,
      });
      if (moveResult.isErr()) {
        if (isResolveMountFilePathError(moveResult.error)) {
          const { code, message } = moveResult.error;
          return apiError(req, res, {
            status_code: code === "outside_scope" ? 403 : 400,
            api_error: {
              type:
                code === "outside_scope"
                  ? "workspace_auth_error"
                  : "invalid_request_error",
              message,
            },
          });
        }
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: normalizeError(moveResult.error).message,
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
          message: "Only GET, PATCH, POST and DELETE methods are supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
