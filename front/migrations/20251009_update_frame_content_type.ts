import chunk from "lodash/chunk";
import type { Logger } from "pino";

import {
  FileModel,
  ShareableFileModel,
} from "@app/lib/resources/storage/models/files";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { frameContentType } from "@app/types";

const CHUNK_SIZE = 100;
const CONCURRENCY = 5;

const LEGACY_FRAME_CONTENT_TYPE = "application/vnd.dust.client-executable";

async function updateLegacyFrameContentType(
  logger: Logger,
  { execute }: { execute: boolean }
) {
  // All shared files should be frame.
  const sharedFiles = await ShareableFileModel.findAll({});

  logger.info({ total: sharedFiles.length }, "Found shared files");

  const chunkSharedFiles = chunk(sharedFiles, CHUNK_SIZE);

  await concurrentExecutor(
    chunkSharedFiles,
    async (c) => {
      const whereClause = {
        id: c.map((sf) => sf.fileId),
        contentType: LEGACY_FRAME_CONTENT_TYPE,
      };

      let updatedCount = 0;
      if (execute) {
        updatedCount = await FileModel.count({
          where: whereClause,
        });
      } else {
        [updatedCount] = await FileModel.update(
          {
            contentType: frameContentType,
          },
          {
            where: whereClause,
          }
        );
      }

      logger.info(
        { chunkSize: c.length, updatedCount },
        "Processed a chunk of shared files"
      );
    },
    {
      concurrency: CONCURRENCY,
    }
  );
}

makeScript({}, async ({ execute }, logger) => {
  await updateLegacyFrameContentType(logger, { execute });
});
