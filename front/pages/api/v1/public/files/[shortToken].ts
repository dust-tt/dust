import type { FileType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { FileResource } from "@app/lib/resources/file_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isInteractiveContentType } from "@app/types";

export interface PublicFileResponseBody {
  content?: string;
  file: FileType;
}

/**
 * @ignoreswagger
 *
 * Undocumented API endpoint to get a file by its public share token.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PublicFileResponseBody>>
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

  const { shortToken } = req.query;
  if (typeof shortToken !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing shortToken parameter.",
      },
    });
  }

  const result = await FileResource.fetchByShareTokenWithContent(shortToken);
  if (!result) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const { file, content: fileContent } = result;

  // Only allow conversation interactive files.
  if (
    file.useCase !== "conversation" ||
    !isInteractiveContentType(file.contentType)
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only interactive content files can be shared publicly.",
      },
    });
  }

  // Check if file is safe to display.
  if (!file.isSafeToDisplay()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "File is not safe for public display.",
      },
    });
  }

  res.status(200).json({
    content: fileContent,
    file: file.toJSON(),
  });
}

export default handler;
