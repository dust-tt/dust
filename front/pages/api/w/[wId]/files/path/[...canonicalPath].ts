// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { DustFileSystemError } from "@app/lib/api/file_system/dust_file_system";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  APIErrorWithStatusCode,
  WithAPIErrorResponse,
} from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Serve a file identified by its canonical scoped path, e.g.
 *   GET /api/w/:wId/files/path/conversation-{cId}/report.pdf
 *   GET /api/w/:wId/files/path/pod-{pId}/data.csv
 *
 * Requires a valid session. The DustFileSystem.fromScopedPath factory
 * resolves the conversation or pod from the path prefix and enforces
 * read permissions before streaming the file.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<never>>,
  auth: Authenticator
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

  const { canonicalPath } = req.query;
  if (!Array.isArray(canonicalPath) || canonicalPath.length < 2) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid canonical path: expected at least two path segments " +
          "(e.g. /files/path/conversation-{id}/file.txt).",
      },
    });
  }

  // Reconstruct the full canonical scoped path from URL segments.
  const scopedPath = canonicalPath.join("/");

  // Build a DustFileSystem instance from the scoped path.
  // The factory fetches the conversation or pod from DB and checks permissions.
  const fsResult = await DustFileSystem.fromScopedPath(auth, scopedPath);
  if (fsResult.isErr()) {
    return apiError(req, res, mapFsError(fsResult.error));
  }

  const fs = fsResult.value;

  // Retrieve content type via stat before opening the read stream.
  const statResult = await fs.stat(scopedPath);
  if (statResult.isErr()) {
    return apiError(req, res, mapFsError(statResult.error));
  }
  if (!statResult.value) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const { contentType } = statResult.value;

  // Open the read stream and pipe to the response.
  const readResult = await fs.read(scopedPath);
  if (readResult.isErr()) {
    return apiError(req, res, mapFsError(readResult.error));
  }
  if (!readResult.value) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  res.setHeader("Content-Type", contentType);
  const stream = readResult.value;
  stream.on("error", (err) => {
    logger.error({ err, scopedPath }, "Error streaming canonical file");
    stream.destroy();
    res.end();
  });
  stream.pipe(res);
}

function mapFsError(err: DustFileSystemError): APIErrorWithStatusCode {
  switch (err.code) {
    case "not_found":
      return {
        status_code: 404,
        api_error: { type: "file_not_found", message: err.message },
      };

    case "unauthorized":
      return {
        status_code: 403,
        api_error: { type: "workspace_auth_error", message: err.message },
      };

    case "invalid_path":
    case "legacy_path":
      return {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: err.message },
      };

    case "already_exists":
      return {
        status_code: 409,
        api_error: { type: "invalid_request_error", message: err.message },
      };

    case "too_many_mounts":
    case "internal":
      return {
        status_code: 500,
        api_error: { type: "internal_server_error", message: err.message },
      };

    default:
      assertNever(err.code);
  }
}

export default withSessionAuthenticationForWorkspace(handler);
