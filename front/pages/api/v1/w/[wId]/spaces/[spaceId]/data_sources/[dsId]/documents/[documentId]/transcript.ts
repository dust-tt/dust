import type { UpsertDocumentResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  MAX_AUDIO_SIZE_MB,
  parseUploadAudioRequest,
} from "@app/lib/api/audio/upload";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { enqueueUpsertAudioTranscription } from "@app/lib/upsert_queue";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: `${MAX_AUDIO_SIZE_MB}mb`,
  },
};

/**
 * @ignoreswagger
 * Undocumented endpoint.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<UpsertDocumentResponseType>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST method is supported.",
      },
    });
  }

  const { documentId, dsId } = req.query;
  if (typeof documentId !== "string" || typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId);

  let { spaceId } = req.query;
  if (typeof spaceId !== "string") {
    if (auth.isSystemKey()) {
      spaceId = dataSource?.space.sId;
    } else {
      spaceId = (await SpaceResource.fetchWorkspaceGlobalSpace(auth)).sId;
    }
  }

  if (
    !dataSource ||
    dataSource.space.sId !== spaceId ||
    !dataSource.canRead(auth)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (dataSource.space.kind === "conversations") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
      },
    });
  }

  if (dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "You cannot upload audio to a managed data source.",
      },
    });
  }

  if (!dataSource.canWrite(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "You are not allowed to update data in this data source.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  if (!auth.isSystemKey()) {
    const remaining = await rateLimiter({
      key: `w:${owner.sId}:transcript-upload`,
      maxPerTimeframe: 5,
      timeframeSeconds: 60,
      logger,
    });
    if (remaining <= 0) {
      return apiError(req, res, {
        status_code: 429,
        api_error: {
          type: "rate_limit_error",
          message:
            "You have reached the maximum number of 10 transcript uploads per minute.",
        },
      });
    }
  }

  // Create FileResource for the audio upload
  const fileRes = await FileResource.makeNew({
    blob: null,
    contentType: "audio/mp4",
    fileName: `audio-${documentId}.m4a`,
    fileSize: 0,
    useCase: "audio_transcription",
    workspaceId: owner.id,
  });

  // Get writable stream to store the uploaded audio
  const writableStream = fileRes.getWriteStream({
    auth,
    version: "original",
  });

  const uploadResult = await parseUploadAudioRequest(req, writableStream);
  if (uploadResult.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to upload audio file: ${uploadResult.error.message}`,
      },
    });
  }

  // Enqueue document for transcription.
  const enqueueRes = await enqueueUpsertAudioTranscription({
    upsertAudioTranscription: {
      workspaceId: owner.sId,
      dataSourceId: dataSource.sId,
      documentId,
      tags: [`title:Audio Transcription - ${documentId}`],
      parentId: null,
      parents: [documentId],
      timestamp: null,
      sourceUrl: null,
      title: `Audio Transcription - ${documentId}`,
      fileId: fileRes.sId,
    },
  });

  if (enqueueRes.isErr()) {
    return apiError(
      req,
      res,
      {
        status_code: 500,
        api_error: {
          type: "data_source_error",
          message: "There was an error enqueueing the audio transcription.",
        },
      },
      enqueueRes.error
    );
  }

  logger.info(
    {
      fileId: fileRes.sId,
      documentId,
      dataSourceId: dataSource.sId,
    },
    "Audio file uploaded and document enqueued for transcription"
  );

  return res.status(200).json({
    data_source: dataSource.toJSON(),
    document: {
      document_id: documentId,
    },
  });
}

export default withPublicAPIAuthentication(handler);
