import { makeScript } from "scripts/helpers";

import { QUEUE_NAME } from "@connectors/connectors/notion/temporal/config";
import { upsertPageWorkflow } from "@connectors/connectors/notion/temporal/workflows/admins";
import { getTemporalClient } from "@connectors/lib/temporal";
import { connectorsSequelize } from "@connectors/resources/storage";

makeScript({}, async (execute, logger) => {
  const client = await getTemporalClient();

  const [rows] = await connectorsSequelize.query(`
      SELECT "connectorId", "notionPageId" as "pageId" 
      FROM notion_pages 
      WHERE "lastUpsertedTs" is null 
      AND "createdAt" > NOW() - INTERVAL '6 days'
      AND "skipReason" is null
    `);

  let delay: number = 0;
  for (const row of rows as { connectorId: number; pageId: string }[]) {
    const { connectorId, pageId } = row;

    if (execute) {
      const workflowId = `fix-notion-force-sync-upsert-page-${pageId}-connector-${connectorId}`;

      await client.workflow.start(upsertPageWorkflow, {
        args: [{ connectorId, pageId }],
        taskQueue: QUEUE_NAME,
        workflowId,
        searchAttributes: {
          connectorId: [connectorId],
        },
        memo: {
          connectorId,
        },
        startDelay: `${delay} seconds`,
      });

      logger.info(
        { workflowId, connectorId, pageId },
        `Started workflow with ${delay} s delay`
      );

      delay += 3;
    } else {
      logger.info({ connectorId, pageId }, "Would start workflow");
    }
  }
});
