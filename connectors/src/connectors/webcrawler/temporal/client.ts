import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { getWebCrawlerConfiguration } from "@connectors/connectors/webcrawler";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

import { NEW_QUEUE_NAME,QUEUE_NAME } from "./config";
import {
  crawlNewWebsiteWorkflow,
  crawlNewWebsiteWorkflowId,
  crawlWebsiteSchedulerWorkflow,
  crawlWebsiteSchedulerWorkflowId,
  crawlWebsiteWorkflow,
  crawlWebsiteWorkflowId,
} from "./workflows";

export async function launchCrawlWebsiteWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const client = await getTemporalClient();

  const isNewWebsite = await isNewWebsiteToCrawl(connectorId);
  const workflowId = isNewWebsite
    ? crawlNewWebsiteWorkflowId(connectorId)
    : crawlWebsiteWorkflowId(connectorId);
  const workflow = isNewWebsite
    ? crawlNewWebsiteWorkflow
    : crawlWebsiteWorkflow;
  const taskQueue = isNewWebsite ? NEW_QUEUE_NAME : QUEUE_NAME;
  try {
    const handle: WorkflowHandle<typeof workflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    await client.workflow.start(workflow, {
      args: [connectorId],
      taskQueue: taskQueue,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
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

export async function launchCrawlWebsiteSchedulerWorkflow(): Promise<
  Result<string, Error>
> {
  const client = await getTemporalClient();

  const workflowId = crawlWebsiteSchedulerWorkflowId();
  try {
    const handle = client.workflow.getHandle(workflowId);
    await handle.terminate();
  } catch (e) {
    if (!(e instanceof WorkflowNotFoundError)) {
      throw e;
    }
  }
  try {
    await client.workflow.start(crawlWebsiteSchedulerWorkflow, {
      args: [],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      cronSchedule: "0 * * * *", // every hour, on the hour
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

export async function isNewWebsiteToCrawl(
  connectorId: ModelId
): Promise<Result<boolean, Error>> {
  const configuration = await getWebCrawlerConfiguration(connectorId);
  if (configuration.isErr()) {
    throw new Err(configuration.error as Error);
  }

  const isNew = !configuration.value.lastCrawledAt;
  return new Ok(isNew);
}
