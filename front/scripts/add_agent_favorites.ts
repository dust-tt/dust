import { AgentUserRelation } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";

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
    const workspace = await Workspace.findOne({
      where: {
        sId: wId,
      },
    });

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
        const [, created] = await AgentUserRelation.findOrCreate({
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
