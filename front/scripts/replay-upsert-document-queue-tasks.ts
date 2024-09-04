import { WorkflowNotFoundError } from "@temporalio/common";
import { parse } from "csv-parse";
import fs from "fs";
import path from "path";

import { getTemporalClient } from "@app/lib/temporal";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { launchUpsertDocumentWorkflow } from "@app/temporal/upsert_queue/client";

async function terminateWorkflow(workflowId: string, logger: Logger) {
  const client = await getTemporalClient();
  try {
    const workflowHandle = client.workflow.getHandle(workflowId);
    await workflowHandle.terminate();
    logger.info({ workflowId }, "Workflow successfully terminated.");
    return true;
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      logger.info({ workflowId }, "Workflow not found -- skipping.");
    } else {
      throw e;
    }
  }
  return false;
}

makeScript(
  {
    filePath: {
      type: "string",
      description: "The path to the file",
    },
  },
  async ({ execute, filePath }, logger) => {
    const csvPath = path.resolve(filePath);

    if (!fs.existsSync(path.resolve(csvPath))) {
      logger.info({ csvPath }, "File not found.");
      return;
    }

    const parseTasks = parse({ columns: true, delimiter: "," });

    fs.createReadStream(filePath).pipe(parseTasks);

    for await (const task of parseTasks) {
      // Remove the double quotes if they exist.
      for (const key in task) {
        if (typeof task[key] === "string") {
          task[key] = task[key].replace(/"/g, "");
        }
      }

      const { workspaceId, dataSourceId, upsertQueueId, enqueueTimestamp } =
        task;

      const workflowId = `upsert-queue-document-${workspaceId}-${dataSourceId}-${upsertQueueId}`;

      logger.info(
        { workspaceId, workflowId },
        "Processing upsert document task."
      );

      if (!execute) {
        continue;
      }

      // First, we terminate the current workflow.
      await terminateWorkflow(workflowId, logger);

      // The, we restart the workflow.
      await launchUpsertDocumentWorkflow({
        workspaceId,
        dataSourceId,
        upsertQueueId,
        enqueueTimestamp,
      });

      logger.info(
        { workspaceId, workflowId },
        "Successfully processed upsert document task."
      );
    }
  }
);
