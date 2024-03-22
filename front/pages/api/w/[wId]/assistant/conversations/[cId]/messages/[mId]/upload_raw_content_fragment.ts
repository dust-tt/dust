import type { WithAPIErrorReponse } from "@dust-tt/types";
import { isContentFragmentType } from "@dust-tt/types";
import { Storage } from "@google-cloud/storage";
import { IncomingForm } from "formidable";
import fs from "fs";
import type { NextApiRequest, NextApiResponse } from "next";
import { pipeline } from "stream/promises";

import { getConversation } from "@app/lib/api/assistant/conversation";
import appConfig from "@app/lib/api/config";
import { Authenticator, getSession } from "@app/lib/auth";
import {
  ContentFragmentResource,
  rawContentFragmentUrl,
} from "@app/lib/resources/content_fragment_resource";
import { gcsConfig } from "@app/lib/resources/storage/config";
import { apiError, withLogging } from "@app/logger/withlogging";

export const config = {
  api: {
    bodyParser: false, // Disabling Next.js's body parser as formidable has its own
  },
};

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

  switch (req.method) {
    case "POST":
      const message = conversation.content
        .flat()
        .find((m) => m.sId === messageId);
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

        const storage = new Storage({
          keyFilename: appConfig.getServiceAccount(),
        });

        const bucket = storage.bucket(gcsConfig.getGcsPrivateUploadsBucket());
        const filePath = rawContentFragmentUrl({
          worskpaceId: owner.sId,
          conversationId,
          messageId,
        });
        const gcsFile = bucket.file(filePath);
        const fileStream = fs.createReadStream(file.filepath);

        await pipeline(
          fileStream,
          gcsFile.createWriteStream({
            metadata: {
              contentType: file.mimetype,
            },
          })
        );

        const fileUrl = `https://storage.googleapis.com/${gcsConfig.getGcsPrivateUploadsBucket()}/${filePath}`;

        // set content fragment's sourceUrl to the uploaded file
        const cf = await ContentFragmentResource.fromMessageId(message.id);
        await cf.update({ sourceUrl: fileUrl });

        res.status(200).json({ sourceUrl: fileUrl });
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
