import { AgentUserRelationModel } from "@app/lib/models/agent/agent";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { GLOBAL_AGENTS_SID } from "@app/types";

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      description: "Workspace ID",
    },
    agentConfigurationSIDs: {
      type: "string",
      demandOption: true,
      description:
        "Comma-separated list of agent configuration SIDs to favorite",
    },
  },
  async ({ wId, agentConfigurationSIDs, execute }, logger) => {
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
    const agents = agentConfigurationSIDs.split(",").map((sid) => sid.trim());

    // Check if all agents exist by looking up in AgentConfiguration and GlobalAgentSettings
    for (const agentConfigurationSID of agents) {
      // Skip check for global agents
      if (agentConfigurationSID in GLOBAL_AGENTS_SID) {
        continue;
      }

      const agentRelation = await AgentUserRelationModel.findOne({
        where: {
          workspaceId: workspace.id,
          agentConfiguration: agentConfigurationSID,
        },
      });

      if (!agentRelation) {
        logger.error(
          { agentConfigurationSID },
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
      for (const agentConfigurationSID of agents) {
        // Check if relation already exists
        const [, created] = await AgentUserRelationModel.findOrCreate({
          where: {
            workspaceId: workspace.id,
            userId: membership.userId,
            agentConfiguration: agentConfigurationSID,
          },
          defaults: {
            workspaceId: workspace.id,
            userId: membership.userId,
            agentConfiguration: agentConfigurationSID,
            favorite: true,
          },
        });

        if (created) {
          logger.info(
            {
              userId: membership.userId,
              agentConfigurationSID,
            },
            "Created agent favorite"
          );
        } else {
          logger.info(
            {
              userId: membership.userId,
              agentConfigurationSID,
            },
            "Agent relation already exists - skipping"
          );
        }
      }
    }
  }
);
