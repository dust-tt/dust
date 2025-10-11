import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import {
  ScheduleOverlapPolicy,
  WorkflowExecutionAlreadyStartedError,
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
import type { CrawlingFrequency, ModelId } from "@connectors/types";
import { CrawlingFrequencies, normalizeError } from "@connectors/types";

import { WebCrawlerQueueNames } from "./config";
import {
  crawlWebsiteSchedulerWorkflow,
  crawlWebsiteWorkflow,
  crawlWebsiteWorkflowId,
  firecrawlCrawlCompletedWorkflow,
  firecrawlCrawlCompletedWorkflowId,
  firecrawlCrawlFailedWorkflow,
  firecrawlCrawlFailedWorkflowId,
  firecrawlCrawlPageWorkflow,
  firecrawlCrawlPageWorkflowId,
  firecrawlCrawlStartedWorkflow,
  firecrawlCrawlStartedWorkflowId,
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

function isCrawlFrequency(value: string): value is CrawlingFrequency {
  return (CrawlingFrequencies as readonly string[]).includes(value);
}

export async function updateCrawlerCrawlFrequency(
  connectorId: string,
  crawlFrequency: string
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const webcrawlerConfig =
    await WebCrawlerConfigurationResource.fetchByConnectorId(connector.id);

  if (!webcrawlerConfig) {
    return new Err(new Error(`CrawlerConfig not found for ${connector.id}`));
  }

  if (!isCrawlFrequency(crawlFrequency)) {
    return new Err(new Error(`"${crawlFrequency}" is not a valid frequency`));
  }

  await webcrawlerConfig.updateCrawlFrequency(crawlFrequency);

  return new Ok(undefined);
}

export async function updateCrawlerActions(
  connectorId: string,
  actions: string
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const webcrawlerConfig =
    await WebCrawlerConfigurationResource.fetchByConnectorId(connector.id);

  if (!webcrawlerConfig) {
    return new Err(new Error(`CrawlerConfig not found for ${connector.id}`));
  }

  if (actions === "") {
    await webcrawlerConfig.updateActions(null);
  } else {
    try {
      const parsedActions = JSON.parse(actions);
      logger.info({ parsedActions }, "update crawler actions");
      await webcrawlerConfig.updateActions(parsedActions);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  return new Ok(undefined);
}

// Firecrawl related workflows

export async function launchFirecrawlCrawlStartedWorkflow(
  connectorId: ModelId,
  crawlId: string
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const client = await getTemporalClient();
  const workflowId = firecrawlCrawlStartedWorkflowId(connectorId, crawlId);

  try {
    await client.workflow.start(firecrawlCrawlStartedWorkflow, {
      args: [connectorId, crawlId],
      taskQueue: WebCrawlerQueueNames.FIRECRAWL,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId: connectorId,
      },
    });
    return new Ok(workflowId);
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.warn(
        { workflowId, connectorId, crawlId },
        "Workflow already started"
      );
      return new Ok(workflowId);
    }
    return new Err(normalizeError(e));
  }
}

export async function launchFirecrawlCrawlFailedWorkflow(
  connectorId: ModelId,
  crawlId: string
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const client = await getTemporalClient();
  const workflowId = firecrawlCrawlFailedWorkflowId(connectorId, crawlId);

  try {
    await client.workflow.start(firecrawlCrawlFailedWorkflow, {
      args: [connectorId, crawlId],
      taskQueue: WebCrawlerQueueNames.FIRECRAWL,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId: connectorId,
      },
    });
    return new Ok(workflowId);
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.warn(
        { workflowId, connectorId, crawlId },
        "Workflow already started"
      );
      return new Ok(workflowId);
    }
    return new Err(normalizeError(e));
  }
}

export async function launchFirecrawlCrawlCompletedWorkflow(
  connectorId: ModelId,
  crawlId: string
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const client = await getTemporalClient();
  const workflowId = firecrawlCrawlCompletedWorkflowId(connectorId, crawlId);

  try {
    await client.workflow.start(firecrawlCrawlCompletedWorkflow, {
      args: [connectorId, crawlId],
      taskQueue: WebCrawlerQueueNames.FIRECRAWL,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId: connectorId,
      },
    });
    return new Ok(workflowId);
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.warn(
        { workflowId, connectorId, crawlId },
        "Workflow already started"
      );
      return new Ok(workflowId);
    }
    return new Err(normalizeError(e));
  }
}

export async function launchFirecrawlCrawlPageWorkflow(
  connectorId: ModelId,
  crawlId: string,
  scrapeId: string
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const client = await getTemporalClient();
  const workflowId = firecrawlCrawlPageWorkflowId(
    connectorId,
    crawlId,
    scrapeId
  );

  try {
    await client.workflow.start(firecrawlCrawlPageWorkflow, {
      args: [connectorId, crawlId, scrapeId],
      // Firecrawl API often returns 404 if we attempt to get the page details too quickly.
      startDelay: "30s", // Delay the start of the workflow by 30 seconds.
      taskQueue: WebCrawlerQueueNames.FIRECRAWL,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId: connectorId,
      },
    });
    return new Ok(workflowId);
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.warn(
        { workflowId, connectorId, crawlId },
        "Workflow already started"
      );
      return new Ok(workflowId);
    }
    return new Err(normalizeError(e));
  }
}
