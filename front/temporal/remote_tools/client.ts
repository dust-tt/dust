import { WorkflowNotFoundError } from "@temporalio/client";

import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

import { QUEUE_NAME } from "./config";
import { syncRemoteMCPServersWorkflow } from "./workflows";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";

export async function launchRemoteMCPServersSyncWorkflow(): Promise<
  Result<string, Error>
> {
  const client = await getTemporalClient();
  const workflowIdHandle = "remote-mcp-servers-sync";

  try {
    let i = 0;

    do {
      try {
        const handle = client.workflow.getHandle(`${workflowIdHandle}-sync-${i}`);
        await handle.terminate();
      } catch (e) {
        if (!(e instanceof WorkflowNotFoundError)) {
          throw e;
        }
      }  

      // Batches of 100 servers.
      const servers = await RemoteMCPServerResource.dangerouslyListAllServers(
        i * 100,
        (i + 1) * 100
      );
      if (servers.length === 0) {
        break;
      }

      await client.workflow.start(syncRemoteMCPServersWorkflow, {
        args: [{ servers }],
        taskQueue: QUEUE_NAME,
        workflowId: `${workflowIdHandle}-sync-${i}`,
        memo: {
          workflowId: `${workflowIdHandle}-sync-${i}`,
          servers: servers.map((server) => server.sId),
        },
      });

      await client.schedule.create({
        action: {
          type: "startWorkflow",
          workflowType: syncRemoteMCPServersWorkflow,
          args: [{ servers }],
          taskQueue: QUEUE_NAME,
        },
        scheduleId: `${workflowIdHandle}-schedule-${i}`,
        spec: {
          cronExpressions: ["0 12 * * 0"], // Every Sunday at 12:00 PM
        },
        memo: {
          workflowId: `${workflowIdHandle}-sync-${i}`,
          servers: servers.map((server) => server.sId),
        },
      });

      logger.info(
        {
          msg: "Scheduled remote MCP servers sync workflow",
          workflowId: `${workflowIdHandle}-sync-${i}`,
          servers: servers.map((server) => server.sId),
        },
        "Remote MCP servers sync workflow scheduled."
      );

      // Increment batch index
      i++;
    } while (true);

    return new Ok(workflowIdHandle);
  } catch (e) {
    logger.error(
      {
        error: e,
      },
      "Failed to start remote MCP servers sync workflow."
    );

    return new Err(e as Error);
  }
}
