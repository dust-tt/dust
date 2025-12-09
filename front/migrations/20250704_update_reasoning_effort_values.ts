import { Op } from "sequelize";

import { getSupportedModelConfig } from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import { AgentReasoningConfigurationModel } from "@app/lib/models/agent/actions/reasoning";
import { AgentConfiguration } from "@app/lib/models/agent/agent";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

const WORKSPACE_CONCURRENCY = 10;
const UPDATE_CONCURRENCY = 50;

/**
 * Migrates reasoning effort values:
 * - Changes "low" to "light"
 * - Sets null/undefined to the model's default reasoning effort
 * - Only updates agents with "active" status
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

  // Update agent configurations with "low" reasoning effort
  const agentConfigsWithLow = await AgentConfiguration.findAll({
    where: {
      workspaceId,
      reasoningEffort: "low",
      status: "active",
    },
  });

  workspaceLogger.info(
    `Found ${agentConfigsWithLow.length} active agent configurations with reasoning effort "low"`
  );

  if (execute && agentConfigsWithLow.length > 0) {
    await concurrentExecutor(
      agentConfigsWithLow,
      async (config) => {
        await config.update({ reasoningEffort: "medium" });
        workspaceLogger.info(
          `Updated agent configuration ${config.sId} reasoning effort from "low" to "medium"`
        );
      },
      { concurrency: UPDATE_CONCURRENCY }
    );
  } else if (agentConfigsWithLow.length > 0) {
    workspaceLogger.info(
      `Would update ${agentConfigsWithLow.length} agent configurations from "low" to "medium"`
    );
  }

  // Update agent configurations with null/undefined reasoning effort
  const agentConfigsWithNull = await AgentConfiguration.findAll({
    where: {
      workspaceId,
      reasoningEffort: {
        [Op.is]: null,
      },
      status: "active",
    },
  });

  workspaceLogger.info(
    `Found ${agentConfigsWithNull.length} active agent configurations with null/undefined reasoning effort`
  );

  if (execute && agentConfigsWithNull.length > 0) {
    await concurrentExecutor(
      agentConfigsWithNull,
      async (config) => {
        // Get the model configuration to determine default reasoning effort
        const modelConfig = getSupportedModelConfig({
          providerId: config.providerId,
          modelId: config.modelId,
        });

        if (modelConfig) {
          await config.update({
            reasoningEffort: modelConfig.defaultReasoningEffort,
          });
          workspaceLogger.info(
            `Updated agent configuration ${config.sId} reasoning effort from null to "${modelConfig.defaultReasoningEffort}" (model default)`
          );
        } else {
          workspaceLogger.warn(
            `Could not find model config for agent ${config.sId} (${config.providerId}/${config.modelId}), skipping`
          );
        }
      },
      { concurrency: UPDATE_CONCURRENCY }
    );
  } else if (agentConfigsWithNull.length > 0) {
    workspaceLogger.info(
      `Would update ${agentConfigsWithNull.length} agent configurations from null to model defaults`
    );
  }

  // Update agent reasoning configurations with "low"
  const reasoningConfigsWithLow = await AgentReasoningConfigurationModel.findAll({
    where: {
      workspaceId,
      reasoningEffort: "low",
    },
  });

  workspaceLogger.info(
    `Found ${reasoningConfigsWithLow.length} agent reasoning configurations with reasoning effort "low"`
  );

  if (execute && reasoningConfigsWithLow.length > 0) {
    await concurrentExecutor(
      reasoningConfigsWithLow,
      async (config) => {
        await config.update({ reasoningEffort: "medium" });
        workspaceLogger.info(
          `Updated agent reasoning configuration ${config.sId} reasoning effort from "low" to "medium"`
        );
      },
      { concurrency: UPDATE_CONCURRENCY }
    );
  } else if (reasoningConfigsWithLow.length > 0) {
    workspaceLogger.info(
      `Would update ${reasoningConfigsWithLow.length} agent reasoning configurations from "low" to "medium"`
    );
  }

  const totalUpdated =
    agentConfigsWithLow.length +
    agentConfigsWithNull.length +
    reasoningConfigsWithLow.length;
  workspaceLogger.info(
    `Completed reasoning effort update. Total configurations updated: ${totalUpdated}`
  );
}

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    "Starting migration: Update reasoning effort - 'low' to 'medium' and null to model defaults"
  );

  await runOnAllWorkspaces(
    async (workspace) =>
      updateReasoningEffortForWorkspace(workspace, logger, execute),
    { concurrency: WORKSPACE_CONCURRENCY }
  );

  logger.info("Completed reasoning effort migration");
});
