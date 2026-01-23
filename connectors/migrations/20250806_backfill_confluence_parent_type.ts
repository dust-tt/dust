import type { Logger } from "pino";
import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import { ConfluencePageModel } from "@connectors/lib/models/confluence";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types/shared/model_id";
import { concurrentExecutor } from "@connectors/types/shared/utils/async_utils";

const BATCH_SIZE = 1000;

async function backfillConfluenceParentTypeForConnector(
  connector: ConnectorResource,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  let lastId: ModelId | undefined = 0;
  let hasMore = true;

  do {
    const pagesWithParentButWithoutParentType: {
      pageId: string;
      id: ModelId;
    }[] = await ConfluencePageModel.findAll({
      where: {
        connectorId: connector.id,
        parentType: {
          [Op.eq]: null,
        },
        parentId: {
          [Op.ne]: null,
        },
        id: {
          [Op.gt]: lastId,
        },
      },
      attributes: ["pageId", "id"],
      limit: BATCH_SIZE,
      order: [["id", "ASC"]],
    });

    logger.info(
      {
        connectorId: connector.id,
        pagesWithParentButWithoutParentType:
          pagesWithParentButWithoutParentType.length,
      },
      "Found pages with parent but without parent type"
    );

    lastId =
      pagesWithParentButWithoutParentType[
        pagesWithParentButWithoutParentType.length - 1
      ]?.id;

    if (execute) {
      await ConfluencePageModel.update(
        {
          parentType: "page",
        },
        {
          where: {
            connectorId: connector.id,
            pageId: {
              [Op.in]: pagesWithParentButWithoutParentType.map((p) => p.pageId),
            },
          },
        }
      );
    }

    // If we have less than BATCH_SIZE pages, we're done.
    if (pagesWithParentButWithoutParentType.length < BATCH_SIZE) {
      hasMore = false;
      break;
    }
  } while (hasMore);
}

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("confluence", {});

  await concurrentExecutor(
    connectors,
    async (connector) => {
      await backfillConfluenceParentTypeForConnector(connector, {
        execute,
        logger,
      });
    },
    {
      concurrency: 10,
    }
  );
});
