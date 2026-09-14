import { config } from "@app/lib/api/cells/config";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { readFrontTableChunk } from "@app/temporal/relocation/activities/source_region/front";
import type { CellType } from "@app/types/cell";
import { isCellType, SUPPORTED_CELLS } from "@app/types/cell";

function assertCurrentCell(cell: CellType) {
  if (config.getCurrentCell().name !== cell) {
    throw new Error(
      `Relocation must be run from ${cell}. Current cell is ${config.getCurrentCell().name}.`
    );
  }
}

makeScript(
  {
    destCell: {
      type: "string",
      choices: SUPPORTED_CELLS,
      required: true,
    },
    lastId: {
      type: "number",
    },
    limit: {
      type: "number",
      require: true,
    },
    sourceCell: {
      type: "string",
      choices: SUPPORTED_CELLS,
    },
    tableName: {
      type: "string",
      required: true,
    },
    workspaceId: {
      type: "string",
      required: true,
    },
    fileName: {
      type: "string",
    },
  },
  async ({
    destCell,
    lastId,
    limit,
    sourceCell,
    tableName,
    workspaceId,
    fileName,
    execute,
  }) => {
    if (!isCellType(sourceCell) || !isCellType(destCell)) {
      logger.error("Invalid cell.");
      return;
    }

    if (sourceCell === destCell) {
      logger.error("Source and destination cells must be different.");
      return;
    }

    assertCurrentCell(sourceCell);

    if (execute) {
      try {
        const res = await readFrontTableChunk({
          destCell,
          lastId,
          sourceCell,
          tableName,
          workspaceId,
          limit,
          fileName,
        });
        logger.info(res, "readFrontTableChunk");
      } catch (err) {
        logger.error({ err }, "readFrontTableChunk failed");
      }
    } else {
      logger.info("Nothing will be executed");
    }
  }
);
