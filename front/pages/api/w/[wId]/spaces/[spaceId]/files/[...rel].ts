/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getProjectFilesBasePath } from "@app/lib/api/files/mount_path";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<never>>,
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

  // filePath is relative to the project's files base. Reject any traversal attempt.
  const normalizedRelative = path.posix.normalize(rel.join("/"));
  if (
    normalizedRelative.startsWith("..") ||
    normalizedRelative.startsWith("/")
  ) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside project scope.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const basePath = getProjectFilesBasePath({
    workspaceId: owner.sId,
    projectId: space.sId,
  });
  const gcsPath = `${basePath}${normalizedRelative}`;

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
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
