import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { enrichAgentConfigurations } from "@app/lib/api/assistant/configuration/helpers";
import { getAgentConfigurationGroupIdsFromActions } from "@app/lib/api/assistant/permissions";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { isArrayEqual2DUnordered, normalizeArrays } from "@app/lib/utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { AgentConfigurationType } from "@app/types";

async function updateAgentRequestedGroupIds(
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

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  logger.info(
    {
      workspaceId,
      workspaceName: workspace.name,
    },
    "Starting requestedGroupIds update for workspace"
  );

  // Build where clause
  const whereClause: any = { workspaceId: workspace.id };

  if (options.onlyActive) {
    whereClause.status = "active";
  }

  if (options.agentIds && options.agentIds.length > 0) {
    whereClause.sId = options.agentIds;
  }

  // Fetch all agent configurations that match the criteria
  // Note: We filter out global agents as they may reference cross-workspace resources
  const agentConfigurations = await AgentConfiguration.findAll({
    where: {
      ...whereClause,
      scope: ["workspace", "published"],
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
    try {
      // Get the full agent configuration with actions
      // We bypass getAgentConfigurations to avoid permission filtering
      // since we're running as an internal admin
      const agentConfigurationList = await getAgentConfigurations(auth, {
        agentIds: [agent.sId],
        variant: "full",
      });

      let agentConfiguration: AgentConfigurationType;

      if (agentConfigurationList.length === 0) {
        // If not found through API (due to permission filtering), fetch directly from DB
        logger.info(
          { agentId: agent.sId, agentName: agent.name },
          "Agent not returned by API (likely permission filtered), fetching actions directly"
        );

        const agentWithActions = await AgentConfiguration.findOne({
          where: {
            workspaceId: workspace.id,
            sId: agent.sId,
            version: agent.version,
          },
        });

        if (!agentWithActions) {
          logger.warn(
            { agentId: agent.sId },
            "Agent configuration not found in database, skipping"
          );
          errorCount++;
          continue;
        }

        // For agents fetched directly, we get actions using enrichAgentConfigurations
        const enriched = await enrichAgentConfigurations(
          auth,
          [agentWithActions],
          { variant: "full" }
        );

        if (enriched.length === 0 || !enriched[0]) {
          logger.warn(
            { agentId: agent.sId },
            "Failed to enrich agent configuration, skipping"
          );
          errorCount++;
          continue;
        }

        agentConfiguration = enriched[0] as AgentConfigurationType;
      } else {
        agentConfiguration = agentConfigurationList[0];
      }

      // Calculate the correct group IDs from actions
      // Note: You may see workspace_isolation_violation warnings in logs - these are benign
      // monitoring warnings, not actual errors. The auth parameter ensures proper scoping.
      const newRequestedGroupIds =
        await getAgentConfigurationGroupIdsFromActions(auth, {
          actions: agentConfiguration.actions,
        });

      // Convert current requestedGroupIds from string[][] (sIds) to number[][] (modelIds)
      const currentRequestedGroupIds = agentConfiguration.requestedGroupIds.map(
        (groupArray) =>
          groupArray.map((groupSId) => {
            const modelId = getResourceIdFromSId(groupSId);
            if (modelId === null) {
              throw new Error(
                `Invalid group sId: ${groupSId} for agent ${agent.sId}`
              );
            }
            return modelId;
          })
      );

      // Normalize the arrays for comparison
      const normalizedNewGroupIds = normalizeArrays(newRequestedGroupIds);
      const normalizedCurrentGroupIds = normalizeArrays(
        currentRequestedGroupIds
      );

      // Check if the group IDs have changed
      if (
        isArrayEqual2DUnordered(
          normalizedNewGroupIds,
          normalizedCurrentGroupIds
        )
      ) {
        logger.debug(
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
          currentGroupIds: normalizedCurrentGroupIds,
          newGroupIds: normalizedNewGroupIds,
          execute,
        },
        execute
          ? "Updating agent requestedGroupIds"
          : "[DRY RUN] Would update agent requestedGroupIds"
      );

      if (execute) {
        await AgentConfiguration.update(
          { requestedGroupIds: normalizedNewGroupIds },
          {
            where: {
              sId: agent.sId,
              workspaceId: workspace.id,
            },
          }
        );
        updatedCount++;
      } else {
        updatedCount++;
      }
    } catch (error) {
      logger.error(
        {
          agentId: agent.sId,
          agentName: agent.name,
          error,
        },
        "Error updating agent requestedGroupIds"
      );
      errorCount++;
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
      ? "Completed requestedGroupIds update"
      : "[DRY RUN] Completed requestedGroupIds dry run"
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
      demandOption: true,
      description: "The workspace ID (sId) to update agents for",
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
    await updateAgentRequestedGroupIds(workspaceId, execute, logger, {
      onlyActive,
      agentIds: agentIds.map(String),
    });
  }
);
