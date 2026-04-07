import { AgentUserRelationModel } from "@app/lib/models/agent/agent";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      description: "Workspace ID",
    },
    agentConfigurationIds: {
      type: "string",
      demandOption: true,
      description:
        "Comma-separated list of agent configuration SIDs to favorite",
    },
  },
  async ({ wId, agentConfigurationIds, execute }, logger) => {
    // Find the workspace
    const workspace = await WorkspaceResource.fetchById(wId);

    if (!workspace) {
      logger.error({ wId }, "Workspace not found");
      return;
    }

    // Get all active members of the workspace
    const { memberships } = await MembershipResource.getActiveMemberships({
      workspace: renderLightWorkspaceType({ workspace }),
    });

    // Parse agent names
    const agents = agentConfigurationIds.split(",").map((sid) => sid.trim());

    // Check if all agents exist by looking up in AgentConfiguration and GlobalAgentSettings
    for (const agentConfigurationId of agents) {
      // Skip check for global agents
      if (agentConfigurationId in GLOBAL_AGENTS_SID) {
        continue;
      }

      const agentRelation = await AgentUserRelationModel.findOne({
        where: {
          workspaceId: workspace.id,
          agentConfiguration: agentConfigurationId,
        },
      });

      if (!agentRelation) {
        logger.error(
          { agentConfigurationId },
          "Agent configuration not found in workspace"
        );
        return;
      }
    }

    logger.info(
      { wId, agents, memberCount: memberships.length },
      "Adding agent favorites"
    );

    if (!execute) {
      return;
    }

    // For each member and agent combination
    for (const membership of memberships) {
      for (const agentConfigurationId of agents) {
        // Check if relation already exists
        const [, created] = await AgentUserRelationModel.findOrCreate({
          where: {
            workspaceId: workspace.id,
            userId: membership.userId,
            agentConfiguration: agentConfigurationId,
          },
          defaults: {
            workspaceId: workspace.id,
            userId: membership.userId,
            agentConfiguration: agentConfigurationId,
            favorite: true,
          },
        });

        if (created) {
          logger.info(
            {
              userId: membership.userId,
              agentConfigurationId,
            },
            "Created agent favorite"
          );
        } else {
          logger.info(
            {
              userId: membership.userId,
              agentConfigurationId,
            },
            "Agent relation already exists - skipping"
          );
        }
      }
    }
  }
);
