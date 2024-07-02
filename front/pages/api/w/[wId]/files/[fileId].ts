import type {
  FileRequestResponseBody,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import { isDustFileId } from "@dust-tt/types";
import { IncomingForm } from "formidable";
import { file } from "googleapis/build/src/apis/file";
import type { NextApiRequest, NextApiResponse } from "next";

import { maybeApplyPreProcessing } from "@app/lib/api/files/preprocessing";
import { Authenticator, getSession } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError, withLogging } from "@app/logger/withlogging";

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
  res: NextApiResponse<WithAPIErrorReponse<FileRequestResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  const user = auth.user();
  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "Could not find the user of the current session.",
      },
    });
  }

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
  if (typeof fileId !== "string" || !isDustFileId(fileId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing fileId query parameter.",
      },
    });
  }

  const fileRes = await FileResource.fetchById(auth, fileId);
  if (!fileRes) {
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
        const readStream = await fileRes.getReadStream(auth, "original");
        readStream.on("error", () => {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "file_not_found",
              message: "File not found.",
            },
          });
        });

        readStream.pipe(res);
        return;
      }

      // Redirect to a signed URL.
      const url = await fileRes.getSignedUrlForDownload(auth, "original");

      res.redirect(url);
      return;
    }

    case "DELETE": {
      const deleteRes = await fileRes.delete(auth);
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
      if (fileRes.isReady || fileRes.isFailed) {
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
        fileRes.createdAt.getTime() + UPLOAD_DELAY_AFTER_CREATION_MS <
        Date.now()
      ) {
        await fileRes.markAsFailed();

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
            return fileRes.getWriteStream(auth, "original");
          },
          // Support only one file upload.
          maxFiles: 1,
        });
        const [, files] = await form.parse(req);

        const maybeFiles = files.file;

        if (!maybeFiles || maybeFiles.length === 0) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "No file uploaded",
            },
          });
        }

        const [fileData] = maybeFiles;

        // Ensure the uploaded file matches the original file.
        const { mimetype, size } = fileData;
        if (mimetype !== fileRes.contentType || size !== fileRes.fileSize) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "The uploaded file does not match the original file.",
            },
          });
        }

        const preProcessingRes = await maybeApplyPreProcessing(auth, fileRes);
        if (preProcessingRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Failed to process the file.",
            },
          });
        }

        res.status(200).json({ file: fileRes.toJSON(auth) });
        return;
      } catch (error) {
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

export default withLogging(handler);
