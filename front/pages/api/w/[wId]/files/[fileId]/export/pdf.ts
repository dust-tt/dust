// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { exportInteractiveContentFileAsPdf } from "@app/lib/api/files/pdf_export";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const PostPdfExportBodySchema = z.object({
  orientation: z.enum(["portrait", "landscape"]).optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<Buffer>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST method is supported.",
      },
    });
  }

  const { fileId } = req.query;
  if (!isString(fileId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing fileId query parameter.",
      },
    });
  }

  const bodyResult = PostPdfExportBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${bodyResult.error.message}`,
      },
    });
  }

  const result = await exportInteractiveContentFileAsPdf(auth, {
    fileId,
    orientation: bodyResult.data.orientation,
  });

  if (result.isErr()) {
    const { error } = result;
    switch (error.type) {
      case "file_not_found":
        return apiError(req, res, {
          status_code: 404,
          api_error: { type: "file_not_found", message: error.message },
        });
      case "invalid_request":
        return apiError(req, res, {
          status_code: 400,
          api_error: { type: "invalid_request_error", message: error.message },
        });
      case "render_failed":
        return apiError(req, res, {
          status_code: 500,
          api_error: { type: "internal_server_error", message: error.message },
        });
      default:
        assertNever(error.type);
    }
  }

  const { buffer, fileName } = result.value;
  // Sanitize filename for Content-Disposition: use ASCII-only fallback for
  // `filename` and RFC 5987 `filename*` for the full UTF-8 name.
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, "_");
  const encodedName = encodeURIComponent(fileName);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
  );
  res.setHeader("Content-Length", buffer.length);
  res.status(200).send(buffer);
}

export default withSessionAuthenticationForWorkspace(handler);
