// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { mapFsError } from "@app/lib/api/files/file_system_http_errors";
import {
  moveCanonicalFile,
  renameCanonicalFile,
  streamThumbnail,
} from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { z } from "zod";
import { fromError } from "zod-validation-error";

/**
 * Unified file system API by canonical scoped path.
 *
 *   GET    /api/w/:wId/files/path/conversation-{cId}/report.pdf         stream inline
 *   GET    /api/w/:wId/files/path/pod-{pId}/data.csv?download=1         stream + Content-Disposition
 *   GET    /api/w/:wId/files/path/conversation-{cId}/photo.png?thumbnail=1  stream thumbnail
 *   HEAD   /api/w/:wId/files/path/{...canonicalPath}                    metadata only
 *   PATCH  /api/w/:wId/files/path/{...canonicalPath}  { action:"rename", fileName }
 *   PATCH  /api/w/:wId/files/path/{...canonicalPath}  { action:"move",   dest }
 *   DELETE /api/w/:wId/files/path/{...canonicalPath}
 */

const PatchBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    fileName: z
      .string()
      .min(1)
      .refine((v) => !v.includes("/") && !v.includes("\\"), {
        message: "fileName must not contain path separators.",
      }),
  }),
  z.object({
    action: z.literal("move"),
    dest: z.string().min(1),
  }),
]);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<never>>,
  auth: Authenticator
): Promise<void> {
  const { canonicalPath: segments } = req.query;
  if (!Array.isArray(segments) || segments.length < 2) {
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

  const canonicalPath = segments.join("/");

  const fsResult = await DustFileSystem.fromScopedPath(auth, canonicalPath);
  if (fsResult.isErr()) {
    return apiError(req, res, mapFsError(fsResult.error));
  }
  const dustFs = fsResult.value;

  switch (req.method) {
    case "HEAD": {
      const statResult = await dustFs.stat(canonicalPath);
      if (statResult.isErr()) {
        return apiError(req, res, mapFsError(statResult.error));
      }
      if (!statResult.value) {
        return apiError(req, res, {
          status_code: 404,
          api_error: { type: "file_not_found", message: "File not found." },
        });
      }

      res.setHeader("Content-Type", statResult.value.contentType);
      res.setHeader("Content-Length", statResult.value.sizeBytes);
      res.status(200).end();
      return;
    }

    case "GET": {
      const { thumbnail, download } = req.query;

      // ?thumbnail=1 serves the resized/processed version (images only).
      if (isString(thumbnail) && thumbnail !== "0") {
        const thumbResult = await streamThumbnail(auth, dustFs, canonicalPath);
        if (thumbResult.isErr()) {
          const err = thumbResult.error;
          switch (err.code) {
            case "not_found":
              return apiError(req, res, {
                status_code: 404,
                api_error: { type: "file_not_found", message: err.message },
              });

            case "not_image":
              return apiError(req, res, {
                status_code: 400,
                api_error: {
                  type: "invalid_request_error",
                  message: err.message,
                },
              });

            case "internal":
              return apiError(req, res, {
                status_code: 500,
                api_error: {
                  type: "internal_server_error",
                  message: err.message,
                },
              });

            default:
              assertNever(err.code);
          }
        }

        const { stream, contentType } = thumbResult.value;
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "private, max-age=3600");
        stream.on("error", (err) => {
          logger.error({ err, canonicalPath }, "Error streaming thumbnail");
          stream.destroy();
          res.end();
        });
        stream.pipe(res);
        return;
      }

      // Normal inline or attachment stream.
      const statResult = await dustFs.stat(canonicalPath);
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

      const readResult = await dustFs.read(canonicalPath);
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

      // ?download=1 sets Content-Disposition: attachment.
      if (isString(download) && download !== "0") {
        const fileName = path.posix.basename(canonicalPath);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(fileName)}"`
        );
      }

      const stream = readResult.value;
      stream.on("error", (err) => {
        logger.error({ err, canonicalPath }, "Error streaming canonical file");
        stream.destroy();
        res.end();
      });
      stream.pipe(res);
      return;
    }

    case "PATCH": {
      const bodyValidation = PatchBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(bodyValidation.error).toString(),
          },
        });
      }

      const body = bodyValidation.data;

      switch (body.action) {
        case "rename": {
          const renameResult = await renameCanonicalFile(
            auth,
            dustFs,
            canonicalPath,
            body.fileName
          );
          if (renameResult.isErr()) {
            return apiError(req, res, mapFsError(renameResult.error));
          }

          break;
        }

        case "move": {
          if (body.dest === canonicalPath) {
            res.status(200).end();
            return;
          }

          const moveResult = await moveCanonicalFile(
            auth,
            dustFs,
            canonicalPath,
            body.dest
          );
          if (moveResult.isErr()) {
            return apiError(req, res, mapFsError(moveResult.error));
          }

          break;
        }

        default:
          assertNever(body);
      }

      res.status(200).end();
      return;
    }

    case "DELETE": {
      const deleteResult = await dustFs.delete(canonicalPath);
      if (deleteResult.isErr()) {
        return apiError(req, res, mapFsError(deleteResult.error));
      }

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Only GET, HEAD, PATCH and DELETE methods are supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
