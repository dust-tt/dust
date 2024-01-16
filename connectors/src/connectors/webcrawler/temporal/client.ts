import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { Connector } from "@connectors/lib/models";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";

import { QUEUE_NAME } from "./config";
import { crawlWebsiteWorkflow, crawlWebsiteWorkflowId } from "./workflows";

export async function launchCrawlWebsiteWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const client = await getTemporalClient();

  const workflowId = crawlWebsiteWorkflowId(connectorId);
  try {
    const handle: WorkflowHandle<typeof crawlWebsiteWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    await client.workflow.start(crawlWebsiteWorkflow, {
      args: [connectorId],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,

      memo: {
        connectorId: connectorId,
      },
    });
    logger.info(
      {
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(e as Error);
  }
}

export async function stopCrawlWebsiteWorkflow(
  connectorId: ModelId
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();

  const workflowId = crawlWebsiteWorkflowId(connectorId);
  try {
    const handle: WorkflowHandle<typeof crawlWebsiteWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed stopping workflow.`
    );
    return new Err(e as Error);
  }
}
