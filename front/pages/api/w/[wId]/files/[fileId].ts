import type {
  FileUploadedRequestResponseBody,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { IncomingForm } from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

import { maybeApplyPreProcessing } from "@app/lib/api/files/preprocessing";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError } from "@app/logger/withlogging";

const UPLOAD_DELAY_AFTER_CREATION_MS = 1000 * 60 * 1; // 1 minute.

export const config = {
  api: {
    bodyParser: false, // Disabling Next.js's body parser as formidable has its own.
  },
};

const validActions = ["view", "download"] as const;
type Action = (typeof validActions)[number];

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FileUploadedRequestResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users of the current workspace can update chat sessions.",
      },
    });
  }

  const { fileId } = req.query;
  if (typeof fileId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing fileId query parameter.",
      },
    });
  }

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const action: Action = validActions.includes(req.query.action as Action)
        ? (req.query.action as Action)
        : "download";

      // TODO(2024-07-01 flav) Expose the different versions of the file.
      if (action === "view") {
        const readStream = file.getReadStream({
          auth,
          version: "original",
        });
        readStream.on("error", () => {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "file_not_found",
              message: "File not found.",
            },
          });
        });
        res.setHeader("Content-Type", file.contentType);
        readStream.pipe(res);
        return;
      }

      // Redirect to a signed URL.
      const url = await file.getSignedUrlForDownload(auth, "original");

      res.redirect(url);
      return;
    }

    case "DELETE": {
      const deleteRes = await file.delete(auth);
      if (deleteRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to delete the file.",
          },
        });
      }

      res.status(204).end();
      return;
    }

    case "POST": {
      if (file.isReady || file.isFailed) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The file has already been uploaded or the upload has failed.",
          },
        });
      }

      if (
        file.createdAt.getTime() + UPLOAD_DELAY_AFTER_CREATION_MS <
        Date.now()
      ) {
        await file.markAsFailed();

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "File upload has expired. Create a new file.",
          },
        });
      }

      try {
        const form = new IncomingForm({
          // Stream the uploaded document to the cloud storage.
          fileWriteStreamHandler: () => {
            return file.getWriteStream({
              auth,
              version: "original",
            });
          },

          // Support only one file upload.
          maxFiles: 1,

          // Validate the file size.
          maxFileSize: file.fileSize,

          // Ensure the file is of the correct type.
          filter: function (part) {
            if (part.mimetype !== file.contentType) {
              return false;
            }

            return true;
          },
        });
        const [, files] = await form.parse(req);

        const maybeFiles = files.file;

        if (!maybeFiles || maybeFiles.length === 0) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "file_type_not_supported",
              message: "File is not supported.",
            },
          });
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.startsWith("options.maxTotalFileSize")) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "file_too_large",
                message: "File is too large.",
              },
            });
          }
        }

        return apiError(
          req,
          res,
          {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Error uploading file.",
            },
          },
          error instanceof Error ? error : new Error(JSON.stringify(error))
        );
      }

      const preProcessingRes = await maybeApplyPreProcessing(auth, file);
      if (preProcessingRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to process the file.",
          },
        });
      }

      res.status(200).json({ file: file.toJSON(auth) });
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
