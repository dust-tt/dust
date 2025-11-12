import formidable from "formidable";
import fs from "fs/promises";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import { getPublicUploadBucket } from "@app/lib/file_storage";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { apiError } from "@app/logger/withlogging";
import type {
  AllSupportedFileContentType,
  WithAPIErrorResponse,
} from "@app/types";

export type PostPokeAnnouncementImageUploadResponseBody = {
  fileId: string;
  url: string;
};

export const config = {
  api: {
    bodyParser: false, // We need to handle multipart/form-data manually
  },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostPokeAnnouncementImageUploadResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported.",
      },
    });
  }

  // Parse the multipart form data
  const form = formidable({ maxFileSize: 10 * 1024 * 1024 }); // 10MB max

  try {
    const [fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "No file provided",
        },
      });
    }

    // Generate a unique file ID
    const fileId = generateRandomModelSId();
    const bucket = getPublicUploadBucket();

    // Store in announcements/images/ directory
    const storagePath = `announcements/images/${fileId}`;

    // Read file content as buffer
    const fileBuffer = await fs.readFile(file.filepath);

    // Upload directly to GCS using the bucket file API
    const gcsFile = bucket.file(storagePath);
    await gcsFile.save(fileBuffer, {
      contentType: file.mimetype || "image/png",
      metadata: {
        cacheControl: "public, max-age=31536000",
      },
    });

    // Get public URL
    const publicUrl = gcsFile.publicUrl();

    return res.status(200).json({
      fileId,
      url: publicUrl,
    });
  } catch (error) {
    console.error("Image upload error:", error);
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to upload image: ${error instanceof Error ? error.message : String(error)}`,
      },
    });
  }
}

export default withSessionAuthenticationForPoke(handler);
