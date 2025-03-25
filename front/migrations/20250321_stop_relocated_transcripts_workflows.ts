#!/usr/bin/env ts-node-script
import type { Logger } from "pino";

import { pauseAllLabsWorkflows } from "@app/lib/api/labs";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";

async function pauseWorkflowsForWorkspace(
  workspaceId: string,
  logger: Logger,
  execute: boolean
) {
  logger.info(`Processing workspace ${workspaceId}`);

  if (!execute) {
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const pauseLabsRes = await pauseAllLabsWorkflows(auth);

  if (pauseLabsRes.isErr()) {
    logger.error(
      `Failed to pause labs workflows for workspace ${workspaceId}: ${pauseLabsRes.error}`
    );
    throw new Error(`Failed to pause labs workflows: ${pauseLabsRes.error}`);
  }

  logger.info(
    `Successfully paused labs workflows for workspace ${workspaceId}`
  );
}

makeScript(
  {
    workspaceIds: { type: "string", required: false },
  },
  async ({ workspaceIds, execute }, logger) => {
    if (!workspaceIds) {
      logger.error("Usage: Workspace IDs are required (comma-separated)");
      throw new Error("Workspace IDs are required");
    }

    const ids = workspaceIds.split(",").map((id) => id.trim());

    for (const workspaceId of ids) {
      await pauseWorkflowsForWorkspace(workspaceId, logger, execute);
    }
  }
);
