import type { WithAPIErrorReponse } from "@dust-tt/types";
import { isContentFragmentType } from "@dust-tt/types";
import { IncomingForm } from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

import { getConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator, getSession } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { fileAttachmentLocation } from "@app/lib/resources/content_fragment_resource";
import { apiError, withLogging } from "@app/logger/withlogging";

export const config = {
  api: {
    bodyParser: false, // Disabling Next.js's body parser as formidable has its own
  },
};

const privateUploadGcs = getPrivateUploadBucket();

const validFormats = ["raw", "text"] as const;
const validActions = ["view", "download"] as const;
type ContentFormat = (typeof validFormats)[number];
type Action = (typeof validActions)[number];

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<{ sourceUrl: string }>>
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
  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationId = req.query.cId;
  const conversation = await getConversation(auth, conversationId);
  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  if (!(typeof req.query.mId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `mId` (string) is required.",
      },
    });
  }
  const messageId = req.query.mId;
  const message = conversation.content.flat().find((m) => m.sId === messageId);
  if (!message || !isContentFragmentType(message)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Uploading raw content fragment is only supported for 'content fragment' messages.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const contentFormat: ContentFormat = validFormats.includes(
        req.query.format as ContentFormat
      )
        ? (req.query.format as ContentFormat)
        : "raw";

      const action: Action = validActions.includes(req.query.action as Action)
        ? (req.query.action as Action)
        : "download";

      const { filePath } = fileAttachmentLocation({
        workspaceId: owner.sId,
        conversationId,
        messageId,
        contentFormat: action === "view" ? "raw" : contentFormat, // Always use raw format for view.
      });

      if (action === "view") {
        const stream = privateUploadGcs.file(filePath).createReadStream();
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

      // Redirect to a signed URL.
      const url = await privateUploadGcs.getSignedUrl(filePath, {
        // Since we redirect, the use is immediate so expiry can be short.
        expirationDelay: 10 * 1000,
        // Remove special chars.
        promptSaveAs:
          message.title.replace(/[^\w\s.-]/gi, "") +
          (contentFormat === "text" ? ".txt" : ""),
      });

      res.redirect(url);
      return;
    }
    case "POST": {
      const { filePath, downloadUrl } = fileAttachmentLocation({
        workspaceId: owner.sId,
        conversationId,
        messageId,
        contentFormat: "raw",
      });

      try {
        const form = new IncomingForm();
        const [, files] = await form.parse(req);

        const maybeFiles = files.file;

        if (!maybeFiles) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "No file uploaded",
            },
          });
        }

        const [file] = maybeFiles;

        await privateUploadGcs.uploadFileToBucket(file, filePath);

        res.status(200).json({ sourceUrl: downloadUrl });
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
