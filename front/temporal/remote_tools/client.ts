import { WorkflowNotFoundError } from "@temporalio/client";

import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

import { QUEUE_NAME } from "@app/temporal/remote_tools/config";
import { syncRemoteMCPServersWorkflow } from "@app/temporal/remote_tools/workflows";

export async function launchRemoteMCPServersSyncWorkflow(): Promise<
  Result<string, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
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
