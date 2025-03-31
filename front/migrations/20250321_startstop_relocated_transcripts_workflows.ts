import type { Logger } from "pino";

import {
  pauseAllLabsWorkflows,
  startAllLabsWorkflows,
} from "@app/lib/api/labs";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import type { Result } from "@app/types";

async function actionWorkflowsForWorkspace(
  workspaceId: string,
  logger: Logger,
  execute: boolean,
  start: boolean
) {
  logger.info(`Processing workspace ${workspaceId}`);

  if (!execute) {
    logger.info(`Skipping workspace ${workspaceId} because execute is false`);
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  let labsRes: Result<number, Error>;
  if (start) {
    labsRes = await startAllLabsWorkflows(auth);
  } else {
    labsRes = await pauseAllLabsWorkflows(auth);
  }

  if (labsRes.isErr()) {
    logger.error(
      `Failed to ${start ? "start" : "pause"} labs workflows for workspace ${workspaceId}: ${labsRes.error}`
    );
    throw new Error(`Failed to pause labs workflows: ${labsRes.error}`);
  }

  logger.info(
    `Successfully ${start ? "started" : "paused"} labs workflows for workspace ${workspaceId}`
  );
}

makeScript(
  {
    workspaceIds: { type: "string", required: false },
    start: { type: "boolean", required: false },
  },
  async ({ workspaceIds, start, execute }, logger) => {
    if (!workspaceIds) {
      logger.error("Usage: Workspace IDs are required (comma-separated)");
      throw new Error("Workspace IDs are required");
    }

    const ids = workspaceIds.split(",").map((id) => id.trim());

    for (const workspaceId of ids) {
      await actionWorkflowsForWorkspace(workspaceId, logger, execute, start);
    }
  }
);
