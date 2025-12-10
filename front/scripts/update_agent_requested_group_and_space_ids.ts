import isEqual from "lodash/isEqual";
import type { WhereOptions } from "sequelize";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationRequirementsFromActions } from "@app/lib/api/assistant/permissions";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

async function updateAgentRequestedSpaceIds(
  workspaceId: string,
  execute: boolean,
  logger: Logger,
  options: {
    onlyActive?: boolean;
    agentIds?: string[];
  } = {}
) {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });

  logger.info(
    {
      workspaceId,
      workspaceName: workspace.name,
    },
    "Starting requestedSpaceIds update for workspace"
  );

  // Build where clause
  const whereClause: WhereOptions<AgentConfigurationModel> = {
    workspaceId: workspace.id,
  };

  if (options.onlyActive) {
    whereClause.status = "active";
  }

  if (options.agentIds && options.agentIds.length > 0) {
    whereClause.sId = options.agentIds;
  }

  // Fetch all agent configurations that match the criteria
  // Note: We filter out global agents as they may reference cross-workspace resources
  const agentConfigurations = await AgentConfigurationModel.findAll({
    where: {
      ...whereClause,
      scope: ["workspace", "published", "hidden", "visible"],
    },
    order: [["createdAt", "DESC"]],
  });

  logger.info(
    {
      totalAgents: agentConfigurations.length,
      onlyActive: options.onlyActive,
    },
    "Found agent configurations"
  );

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const agent of agentConfigurations) {
    // Get the full agent configuration with actions
    // Using dangerouslyRequestAllGroups auth ensures we can access all agents
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      agentVersion: agent.version,
      variant: "full",
    });

    if (!agentConfiguration) {
      logger.warn(
        { agentId: agent.sId, agentName: agent.name },
        "Agent configuration not found, skipping"
      );
      errorCount++;
      continue;
    }

    // Calculate the correct group IDs from actions
    // Note: You may see workspace_isolation_violation warnings in logs - these are benign
    // monitoring warnings, not actual errors. The auth parameter ensures proper scoping.
    const newRequirements = await getAgentConfigurationRequirementsFromActions(
      auth,
      {
        actions: agentConfiguration.actions,
      }
    );

    const currentRequestedSpaceIds = agentConfiguration.requestedSpaceIds.map(
      (spaceSId) => {
        const modelId = getResourceIdFromSId(spaceSId);
        if (modelId === null) {
          throw new Error(
            `Invalid space sId: ${spaceSId} for agent ${agent.sId}`
          );
        }
        return modelId;
      }
    );

    // Normalize the arrays for comparison
    const newSpaceIds = newRequirements.requestedSpaceIds;

    // Check if the group IDs have changed
    if (isEqual(newSpaceIds.sort(), currentRequestedSpaceIds.sort())) {
      logger.info(
        {
          agentId: agent.sId,
          agentName: agent.name,
        },
        "Agent group IDs are already up to date, skipping"
      );
      skippedCount++;
      continue;
    }

    logger.info(
      {
        agentId: agent.sId,
        agentName: agent.name,
        newSpaceIds: newSpaceIds,
        currentSpaceIds: currentRequestedSpaceIds,
        execute,
      },
      execute
        ? "Updating agent requestedSpaceIds"
        : "[DRY RUN] Would update agent requestedSpaceIds"
    );

    if (execute) {
      await AgentConfigurationModel.update(
        {
          requestedSpaceIds: newSpaceIds,
        },
        {
          where: {
            sId: agent.sId,
            version: agent.version,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );
      updatedCount++;
    } else {
      updatedCount++;
    }
  }

  logger.info(
    {
      workspaceId,
      totalAgents: agentConfigurations.length,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errorCount,
      execute,
    },
    execute
      ? "Completed requestedSpaceIds update"
      : "[DRY RUN] Completed requestedSpaceIds dry run"
  );

  return {
    total: agentConfigurations.length,
    updated: updatedCount,
    skipped: skippedCount,
    errors: errorCount,
  };
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "The workspace ID (sId) to update agents for",
      required: false,
    },
    onlyActive: {
      type: "boolean",
      default: true,
      description: "Only update active agents (default: true)",
    },
    agentIds: {
      type: "array",
      default: [],
      description:
        "Optional list of specific agent IDs to update. If empty, updates all agents in workspace.",
    },
  },
  async ({ workspaceId, execute, onlyActive, agentIds }, logger) => {
    if (workspaceId) {
      // Process specific workspace
      await updateAgentRequestedSpaceIds(workspaceId, execute, logger, {
        onlyActive,
        agentIds: agentIds.map(String),
      });
    } else {
      // Process all workspaces
      await runOnAllWorkspaces(
        async (workspace) => {
          await updateAgentRequestedSpaceIds(workspace.sId, execute, logger, {
            onlyActive,
            agentIds: agentIds.map(String),
          });
        },
        { concurrency: 3 }
      );
    }
  }
);
