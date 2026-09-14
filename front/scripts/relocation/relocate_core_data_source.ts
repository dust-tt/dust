import { config } from "@app/lib/api/cells/config";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import { launchCoreDataSourceRelocationWorkflow } from "@app/temporal/relocation/client";
import { isCellType, SUPPORTED_CELLS } from "@app/types/cell";
import assert from "assert";

makeScript(
  {
    workspaceId: {
      alias: "wId",
      type: "string",
      demandOption: true,
    },
    sourceCell: {
      type: "string",
      choices: SUPPORTED_CELLS,
      demandOption: true,
    },
    destinationCell: {
      type: "string",
      choices: SUPPORTED_CELLS,
      demandOption: true,
    },
    dataSourceCoreIds: {
      type: "string",
      description:
        "The core ids of the data source to relocate (stringified JSON)",
      demandOption: true,
    },
    destIds: {
      type: "string",
      description:
        "The ids of the data source in the destination cell (stringified JSON)",
      demandOption: true,
    },
    pageCursor: {
      type: "string",
      description: "The page cursor to start from",
      default: null,
    },
  },
  async (
    {
      dataSourceCoreIds,
      destIds,
      destinationCell,
      execute,
      pageCursor,
      sourceCell,
      workspaceId,
    },
    logger
  ) => {
    if (!isCellType(sourceCell) || !isCellType(destinationCell)) {
      logger.error("Invalid cell.");
      return;
    }

    if (sourceCell === destinationCell) {
      logger.error("Source and destination cells must be different.");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const owner = auth.getNonNullableWorkspace();

    if (owner.metadata?.maintenance !== "relocation") {
      logger.error("Workspace is not relocating.");
      return;
    }

    assert(
      config.getCurrentCell().name === sourceCell,
      "Must run from the source cell"
    );

    const parsedDataSourceCoreIds = JSON.parse(dataSourceCoreIds);
    const parsedDestIds = JSON.parse(destIds);

    if (execute) {
      await launchCoreDataSourceRelocationWorkflow({
        dataSourceCoreIds: parsedDataSourceCoreIds,
        destIds: parsedDestIds,
        destCell: destinationCell,
        pageCursor,
        sourceCell,
        workspaceId,
      });
    }
  }
);
