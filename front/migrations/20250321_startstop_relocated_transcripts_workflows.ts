import type { Logger } from "pino";

import {
  pauseAllLabsWorkflows,
  startActiveLabsWorkflows,
} from "@app/lib/api/labs";
import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { LabsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/labs_transcripts";
import { makeScript } from "@app/scripts/helpers";
import type { Result } from "@app/types";

async function actionWorkflowsForWorkspace(
  workspaceId: string,
  logger: Logger,
  execute: boolean,
  action: "start" | "stop"
) {
  logger.info(`Processing workspace ${workspaceId}`);

  if (!execute) {
    logger.info(`Skipping workspace ${workspaceId} because execute is false`);
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  let labsRes: Result<number, Error>;
  if (action === "start") {
    labsRes = await startActiveLabsWorkflows(auth);
  } else {
    labsRes = await pauseAllLabsWorkflows(auth);
  }

  if (labsRes.isErr()) {
    logger.error(
      `Failed to ${action} labs workflows for workspace ${workspaceId}: ${labsRes.error}`
    );
    throw new Error(`Failed to ${action} labs workflows: ${labsRes.error}`);
  }

  logger.info(
    `Successfully ${action === "start" ? "started" : "paused"} labs workflows for workspace ${workspaceId}`
  );
}

makeScript(
  {
    workspaceIds: { type: "string", required: false },
    action: { type: "string", required: false },
  },
  async ({ workspaceIds, action, execute }, logger) => {
    if (!workspaceIds) {
      logger.error("Usage: Workspace IDs are required (comma-separated)");
      throw new Error("Workspace IDs are required");
    }

    if (!action || (action !== "start" && action !== "stop")) {
      logger.error('Usage: Action must be either "start" or "stop"');
      throw new Error('Action must be either "start" or "stop"');
    }

    let workspaceIdsArray: string[] = [];

    if (workspaceIds === "all") {
      const labsConfigs = await LabsTranscriptsConfigurationModel.findAll({
        include: [
          {
            model: Workspace,
            attributes: ["sId"],
          },
        ],
      });
      workspaceIdsArray = labsConfigs.map(
        (labsConfig) => labsConfig.workspace.sId
      );
    } else {
      workspaceIdsArray = workspaceIds.split(",").map((id) => id.trim());
    }

    for (const workspaceId of workspaceIdsArray) {
      await actionWorkflowsForWorkspace(workspaceId, logger, execute, action);
    }
  }
);
