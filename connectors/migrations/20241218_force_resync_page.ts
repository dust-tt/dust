import { makeScript } from "scripts/helpers";

import { QUEUE_NAME } from "@connectors/connectors/notion/temporal/config";
import { upsertPageWorkflow } from "@connectors/connectors/notion/temporal/workflows/admins";
import { getTemporalClient } from "@connectors/lib/temporal";
import { sequelizeConnection } from "@connectors/resources/storage";

makeScript({}, async (execute, logger) => {
  const client = await getTemporalClient();

  const [rows] = await sequelizeConnection.query(`
      SELECT "connectorId", "notionPageId" as "pageId" 
      FROM notion_pages 
      WHERE "lastUpsertedTs" is null 
      AND "createdAt" > NOW() - INTERVAL '6 days'
      AND "skipReason" is null
    `);

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
      });

      logger.info({ workflowId, connectorId, pageId }, "Started workflow");
    } else {
      logger.info({ connectorId, pageId }, "Would start workflow");
    }
  }
});
