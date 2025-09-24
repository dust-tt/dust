import formidable from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { findAgentsInMessage } from "@app/lib/utils/find_agents_in_message";
import {
  transcribeFile,
  transcribeStream,
} from "@app/lib/utils/transcribe_service";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export const config = {
  api: {
    // We need the raw request stream for streaming audio and for formidable to parse multipart.
    bodyParser: false,
  },
};

export type PostTranscribeResponseBody = { text: string };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostTranscribeResponseBody | void>>,
  auth: Authenticator
) {
  const { wId } = req.query;
  if (!wId || typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The request query is invalid, expects { workspaceId: string }.",
      },
    });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
    return;
  }

  const form = formidable({ multiples: false });
  const [, files] = await form.parse(req);
  const maybeFiles = files.file;

  if (!maybeFiles || maybeFiles.length !== 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No file uploaded",
      },
    });
  }
  const file = maybeFiles[0];
  const streamResponse = req.query.stream === "true" || false;

  try {
    if (!streamResponse) {
      const r = await transcribeFile(file);
      if (r.isErr()) {
        logger.error(
          { err: r.error, wId },
          "Transcription failed for uploaded file."
        );
        res.status(500).json({
          error: {
            type: "internal_server_error",
            message: "Failed to transcribe file. Please try again later.",
          },
        });
        return;
      }
      res.status(200).json({ text: r.value });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    // Create an AbortController to handle client disconnection
    const controller = new AbortController();
    const { signal } = controller;

    // Handle client disconnection
    req.on("close", () => {
      controller.abort();
    });

    const stream = await transcribeStream(file);
    for await (const chunk of stream) {
      let stop = false;
      switch (chunk.type) {
        case "delta":
          res.write(
            `data: ${JSON.stringify({ type: "delta", delta: chunk.delta })}\n\n`
          );
          // @ts-expect-error - We need it for streaming, but it does not exist in the types.
          res.flush();
          break;

        case "fullTranscript":
          const fullTranscript = await findAgentsInMessage(
            auth,
            chunk.fullTranscript
          );

          res.write(
            `data: ${JSON.stringify({ type: "fullTranscript", fullTranscript })}\n\n`
          );
          stop = true;
          break;

        default:
          assertNever(chunk);
      }

      if (signal.aborted || stop) {
        break;
      }
    }
    res.write("data: done\n\n");
    // @ts-expect-error - We need it for streaming, but it does not exist in the types.
    res.flush();

    res.end();
  } catch (e) {
    const err = normalizeError(e);
    logger.error({ err, wId }, "Unexpected error in transcribe endpoint.");
    res.status(500).json({
      error: {
        type: "internal_server_error",
        message: "Failed to transcribe file. Please try again later.",
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
