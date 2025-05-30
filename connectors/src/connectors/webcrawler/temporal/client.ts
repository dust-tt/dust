import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import {
  ScheduleOverlapPolicy,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { getTemporalClient } from "@connectors/lib/temporal";
import {
  createSchedule,
  scheduleExists,
  triggerSchedule,
} from "@connectors/lib/temporal_schedules";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { WebCrawlerConfigurationResource } from "@connectors/resources/webcrawler_resource";
import type { ModelId } from "@connectors/types";
import { normalizeError, WebcrawlerCustomCrawler } from "@connectors/types";

import { WebCrawlerQueueNames } from "./config";
import {
  crawlWebsiteSchedulerWorkflow,
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
  const webcrawlerConfig =
    await WebCrawlerConfigurationResource.fetchByConnectorId(connector.id);

  if (!webcrawlerConfig) {
    return new Err(new Error(`CrawlerConfig not found for ${connector.id}`));
  }

  const webCrawlerQueueName = webcrawlerConfig.lastCrawledAt
    ? WebCrawlerQueueNames.UPDATE_WEBSITE
    : WebCrawlerQueueNames.NEW_WEBSITE;

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
      taskQueue: webCrawlerQueueName,
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
    return new Err(normalizeError(e));
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
    return new Err(normalizeError(e));
  }
}

export async function launchCrawlWebsiteScheduler() {
  const scheduleId = `webcrawler-scheduler`;

  // Only create the schedule if it doesn't already exist.
  const scheduleAlreadyExists = await scheduleExists({
    scheduleId,
  });
  // If the schedule already exists, trigger it.
  if (scheduleAlreadyExists) {
    return triggerSchedule({
      scheduleId,
    });
  }

  return createSchedule({
    scheduleId,
    action: {
      type: "startWorkflow",
      workflowType: crawlWebsiteSchedulerWorkflow,
      args: [],
      taskQueue: WebCrawlerQueueNames.UPDATE_WEBSITE,
    },
    spec: {
      intervals: [{ every: "1h" }],
      jitter: "5m", // Add some randomness to avoid syncing on the exact hour.
    },
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
      catchupWindow: "1 day",
    },
  });
}

export async function updateCrawlerType(
  connectorId: string,
  newCrawler: string
): Promise<Result<void, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const webcrawlerConfig =
    await WebCrawlerConfigurationResource.fetchByConnectorId(connector.id);

  if (!webcrawlerConfig) {
    return new Err(new Error(`CrawlerConfig not found for ${connector.id}`));
  }

  let customCrawler: WebcrawlerCustomCrawler | null = null;
  // If not default, then we try to match
  if (newCrawler !== "default") {
    customCrawler =
      Object.values(WebcrawlerCustomCrawler).find(
        (value) => value === newCrawler
      ) ?? null;
    if (customCrawler === null) {
      return new Err(new Error(`"${newCrawler}" is not a valid crawler`));
    }
  }

  await webcrawlerConfig.updateCustomCrawler(customCrawler);
  return new Ok(undefined);
}
