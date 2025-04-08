import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import { concurrentExecutor } from "@connectors/lib/async_utils";
import type { GongTranscriptModel } from "@connectors/lib/models/gong";
import type Logger from "@connectors/logger/logger";
import { GongTranscriptResource } from "@connectors/resources/gong_resources";

const BATCH_SIZE = 1024;

function extractTimestampFromTitle(
  gongTranscript: GongTranscriptModel // didn't want to add a method to the resource for a script
): number {
  // Match the date pattern YYYY/MM/DD at the beginning of the title
  const dateMatch = gongTranscript.title.match(/^(\d{4})\/(\d{2})\/(\d{2})/);

  if (!dateMatch) {
    throw new Error(`Invalid date format in title: ${gongTranscript.title}`);
  }

  const [, yearStr, monthStr, dayStr] = dateMatch;

  if (!yearStr || !monthStr || !dayStr) {
    throw new Error(`Invalid date format in title : ${gongTranscript.title}`);
  }

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  const date = new Date(year, month, day);

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format in title ${gongTranscript.title}`);
  }

  return date.getTime();
}

async function backfillConnector(
  connectorId: number,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  let nextId: number | undefined = 0;
  let transcripts;

  do {
    logger.info({ connectorId, nextId }, "Processing batch.");
    transcripts = await GongTranscriptResource.model.findAll({
      where: {
        connectorId,
        id: {
          [Op.gt]: nextId,
        },
      },
      limit: BATCH_SIZE,
    });

    if (execute) {
      await concurrentExecutor(
        transcripts,
        async (t) => {
          await t.update({ callDate: extractTimestampFromTitle(t) });
        },
        {
          concurrency: 24,
        }
      );
    }

    if (transcripts.length === 0) {
      break;
    }
    nextId = transcripts[transcripts.length - 1]?.id;
  } while (transcripts.length === BATCH_SIZE);
}

makeScript(
  { connectorId: { type: "number", required: true } },
  async ({ connectorId, execute }, logger) => {
    logger.info({ connectorId }, "Backfill connector.");
    await backfillConnector(connectorId, { execute, logger });
  }
);
