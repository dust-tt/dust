import type { Readable } from "node:stream";

import busboy from "busboy";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { transcribeFile, transcribeStream } from "@app/lib/utils/transcribe_service";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

interface TranscribeResponseBody {
  transcript?: string;
}

// Helper to detect multipart form uploads.
function isMultipart(req: NextApiRequest): boolean {
  const ct = req.headers["content-type"];
  return typeof ct === "string" && ct.startsWith("multipart/form-data");
}

// Parse multipart form-data and return a Readable stream of the uploaded file.
// We accept the first file field under key "file" (or any field if only one file).
async function parseMultipartToStream(req: NextApiRequest): Promise<{ stream: Readable; filename?: string; mimeType?: string } | null> {
  return new Promise((resolve, reject) => {
    try {
      const bb = busboy({ headers: req.headers });
      let fileResolved = false;

      bb.on("file", (_name, file, info) => {
        if (fileResolved) {
          // Ignore additional files.
          file.resume();
          return;
        }
        fileResolved = true;
        const { filename, mimeType } = info;
        resolve({ stream: file, filename, mimeType });
      });

      bb.on("error", (err) => reject(err));
      bb.on("finish", () => {
        if (!fileResolved) {
          resolve(null);
        }
      });

      // Pipe request into busboy to start parsing.
      (req as unknown as Readable).pipe(bb);
    } catch (e) {
      reject(e);
    }
  });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<TranscribeResponseBody>>
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported.",
      },
    });
  }

  try {
    // If multipart, treat as full file upload and return full transcript as JSON.
    if (isMultipart(req)) {
      const parsed = await parseMultipartToStream(req);
      if (!parsed) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "No file was provided in multipart form-data.",
          },
        });
      }

      const { stream } = parsed;
      const transcript = await transcribeFile(stream);
      return res.status(200).json({ transcript });
    }

    // Otherwise, consider raw request body as audio stream and stream back transcript.
    // We use chunked text output with text/event-stream for incremental delivery.
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Transfer-Encoding": "chunked",
    });

    const readable = req as unknown as Readable;
    for await (const chunk of transcribeStream(readable)) {
      if (chunk) {
        // SSE format: lines starting with "data: ", ending with two newlines per event.
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
    }
    res.write("event: end\n\n");
    res.end();
    return;
  } catch (err) {
    const e = normalizeError(err);
    logger.error({ err: e }, "Transcribe service failed");
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: e.message,
      },
    });
  }
}

export const config = { api: { bodyParser: false } };

export default withSessionAuthenticationForWorkspace(handler, { isStreaming: true });
