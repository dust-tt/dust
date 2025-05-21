import { WorkflowNotFoundError } from "@temporalio/client";

import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

import { QUEUE_NAME } from "./config";
import { syncRemoteMCPServersWorkflow } from "./workflows";

export async function launchRemoteMCPServersSyncWorkflow(): Promise<
  Result<string, Error>
> {
  const client = await getTemporalClient();
  const workflowId = "remote-mcp-servers-sync";

  try {
    try {
      const handle = client.workflow.getHandle(workflowId);
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }

    await client.workflow.start(syncRemoteMCPServersWorkflow, {
      args: [],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        workflowId,
      },
    });

    await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: syncRemoteMCPServersWorkflow,
        args: [],
        taskQueue: QUEUE_NAME,
      },
      scheduleId: workflowId,
      spec: {
        cronExpressions: ["0 12 * * 0"], // Every Sunday at 12:00 PM
      },
      memo: {
        workflowId,
      },
    });

    logger.info(
      {
        workflowId,
      },
      "Started weekly remote MCP servers sync workflow."
    );

    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Failed to start remote MCP servers sync workflow."
    );

    return new Err(normalizeError(e));
  }
}
