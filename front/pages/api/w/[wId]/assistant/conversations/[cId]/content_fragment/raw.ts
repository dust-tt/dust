import type { WithAPIErrorReponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";
import { Storage } from "@google-cloud/storage";
import fs from "fs";

import { getConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";
import { IncomingForm } from "formidable";
import logger from "@app/logger/logger";

const { DUST_UPLOAD_BUCKET = "dust-test-data", SERVICE_ACCOUNT } = process.env;

export const config = {
  api: {
    bodyParser: false, // Disabling Next.js's body parser as formidable has its own
  },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<{ success: true }>>
): Promise<void> {
  logger.info("RAW: Starting handler");
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
  if (!user || !auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "Could not find the user of the current session.",
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

  switch (req.method) {
    case "POST":
      try {
        logger.info("RAW: Starting POST handler");
        const form = new IncomingForm();
        const [_fields, files] = await form.parse(req);
        void _fields;

        logger.warn("RAW: connecting to GCS");
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

        const file = maybeFiles[0];

        const storage = new Storage({
          keyFilename: SERVICE_ACCOUNT,
        });
        logger.info("Uploading file to GCS");
        const bucket = storage.bucket(DUST_UPLOAD_BUCKET);
        const gcsFile = bucket.file(file.newFilename);
        const fileStream = fs.createReadStream(file.filepath);
        logger.info("Starting uploading file to GCS");
        await new Promise((resolve, reject) =>
          fileStream
            .pipe(
              gcsFile.createWriteStream({
                metadata: {
                  contentType: file.mimetype,
                },
              })
            )
            .on("error", reject)
            .on("finish", resolve)
        );
        logger.info("Done uploading file to GCS");
        const fileUrl = `https://storage.googleapis.com/${DUST_UPLOAD_BUCKET}/${file.newFilename}`;

        res.status(200).json({ success: true });
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
