import { Authenticator } from "@app/lib/auth";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

const WORKSPACE_CONCURRENCY = 10;
const UPDATE_CONCURRENCY = 50;

/**
 * Migrates reasoning effort values from "low" to "medium" for both
 * agent configurations and agent reasoning configurations.
 */
async function updateReasoningEffortForWorkspace(
  workspace: LightWorkspaceType,
  logger: typeof Logger,
  execute: boolean
) {
  const workspaceLogger = logger.child({ workspaceId: workspace.sId });

  workspaceLogger.info("Starting reasoning effort update for workspace");

  // Get workspace auth
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const workspaceId = auth.getNonNullableWorkspace().id;

  // Update agent configurations
  const agentConfigsToUpdate = await AgentConfiguration.findAll({
    where: {
      workspaceId,
      reasoningEffort: "low",
    },
  });

  workspaceLogger.info(
    `Found ${agentConfigsToUpdate.length} agent configurations with reasoning effort "low"`
  );

  if (execute && agentConfigsToUpdate.length > 0) {
    await concurrentExecutor(
      agentConfigsToUpdate,
      async (config) => {
        await config.update({ reasoningEffort: "medium" });
        workspaceLogger.info(
          `Updated agent configuration ${config.sId} reasoning effort from "low" to "medium"`
        );
      },
      { concurrency: UPDATE_CONCURRENCY }
    );
  } else if (agentConfigsToUpdate.length > 0) {
    workspaceLogger.info(
      `Would update ${agentConfigsToUpdate.length} agent configurations`
    );
  }

  // Update agent reasoning configurations
  const reasoningConfigsToUpdate = await AgentReasoningConfiguration.findAll({
    where: {
      workspaceId,
      reasoningEffort: "low",
    },
  });

  workspaceLogger.info(
    `Found ${reasoningConfigsToUpdate.length} agent reasoning configurations with reasoning effort "low"`
  );

  if (execute && reasoningConfigsToUpdate.length > 0) {
    await concurrentExecutor(
      reasoningConfigsToUpdate,
      async (config) => {
        await config.update({ reasoningEffort: "medium" });
        workspaceLogger.info(
          `Updated agent reasoning configuration ${config.sId} reasoning effort from "low" to "medium"`
        );
      },
      { concurrency: UPDATE_CONCURRENCY }
    );
  } else if (reasoningConfigsToUpdate.length > 0) {
    workspaceLogger.info(
      `Would update ${reasoningConfigsToUpdate.length} agent reasoning configurations`
    );
  }

  const totalUpdated =
    agentConfigsToUpdate.length + reasoningConfigsToUpdate.length;
  workspaceLogger.info(
    `Completed reasoning effort update. Total configurations updated: ${totalUpdated}`
  );
}

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    "Starting migration: Update reasoning effort from 'low' to 'medium' across all workspaces"
  );

  await runOnAllWorkspaces(
    async (workspace) =>
      updateReasoningEffortForWorkspace(workspace, logger, execute),
    { concurrency: WORKSPACE_CONCURRENCY }
  );

  logger.info("Completed reasoning effort migration");
});
