import type {
  FileRequestResponseBody,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import {
  isDustFileId,
  isSupportedImageContenType,
  isSupportedPlainTextContentType,
} from "@dust-tt/types";
import { IncomingForm } from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getFileNameFromFileMetadata,
  makeStorageFilePathForWorkspaceId,
  resizeAndUploadToFileStorage,
  uploadToFileStorage,
} from "@app/lib/api/files";
import { Authenticator, getSession } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError, withLogging } from "@app/logger/withlogging";

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
      // TODO:
      const action: Action = validActions.includes(req.query.action as Action)
        ? (req.query.action as Action)
        : "download";

      const filePath = makeStorageFilePathForWorkspaceId(owner, fileId);

      if (action === "view") {
        const stream = await getPrivateUploadBucket().fetchWithStream(filePath);
        stream.on("error", () => {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "file_not_found",
              message: "File not found.",
            },
          });
        });

        stream.pipe(res);
        return;
      }

      const fileName = await getFileNameFromFileMetadata(filePath);

      // Redirect to a signed URL.
      const url = await getPrivateUploadBucket().getSignedUrl(filePath, {
        // Since we redirect, the use is immediate so expiry can be short.
        expirationDelay: 10 * 1000,
        promptSaveAs: fileName ?? `dust_${fileId}`,
      });

      res.redirect(url);
      return;
    }

    case "DELETE": {
      const filePath = makeStorageFilePathForWorkspaceId(owner, fileId);

      await getPrivateUploadBucket().delete(filePath);

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

      try {
        // Support only one file upload.
        const form = new IncomingForm({
          fileWriteStreamHandler: () => {
            return fileRes.getStream(auth);
          },
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

        const { mimetype } = fileData;
        if (!mimetype) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "file_type_not_supported",
              message: "File type not supported.",
            },
          });
        }

        // First, save the uploaded document to the cloud storage.
        // TODO:

        if (isSupportedImageContenType(mimetype)) {
          await resizeAndUploadToFileStorage(auth, fileRes, fileData);
        } else if (isSupportedPlainTextContentType(mimetype)) {
          // TODO:(2026-06-28 flav) Move logic to extract text from PDF here.
          await uploadToFileStorage(auth, fileRes, fileData);
        } else {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "File type not supported.",
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
