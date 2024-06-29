import type { WithAPIErrorReponse } from "@dust-tt/types";
import { IncomingForm } from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import {
  decodeFileToken,
  getDownloadUrlForFileId,
  getFileNameFromFileMetadata,
  isDustFileId,
  isSupportedImageMimeType,
  isSupportedTextMimeType,
  makeStorageFilePathForWorkspaceId,
  resizeAndUploadToFileStorage,
  uploadToFileStorage,
} from "@app/lib/files";
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
  res: NextApiResponse<WithAPIErrorReponse<{ downloadUrl: string }>>
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

  const { fileId, token } = req.query;
  if (typeof fileId !== "string" || !isDustFileId(fileId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing fileId query parameter.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const action: Action = validActions.includes(req.query.action as Action)
        ? (req.query.action as Action)
        : "download";

      const filePath = makeStorageFilePathForWorkspaceId(owner, fileId);

      if (action === "view") {
        const stream = await getPrivateUploadBucket().fetchWithStream(filePath);
        stream.on("error", () => {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "message_not_found",
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
      if (typeof token !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid token.",
          },
        });
      }

      // Ensure that the file token is valid.
      const fileTokenPayload = decodeFileToken(token);

      if (!fileTokenPayload || fileTokenPayload.fileId !== fileId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid file id.",
          },
        });
      }

      try {
        const form = new IncomingForm();
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

        const [file] = maybeFiles;

        if (isSupportedImageMimeType(file)) {
          await resizeAndUploadToFileStorage(owner, fileTokenPayload, file);
        } else if (isSupportedTextMimeType(file)) {
          // TODO:(2026-06-28 flav) Move logic to extract text from PDF here.
          await uploadToFileStorage(owner, fileTokenPayload, file);
        } else {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "File type not supported.",
            },
          });
        }

        res
          .status(200)
          .json({ downloadUrl: getDownloadUrlForFileId(owner, fileId) });
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
