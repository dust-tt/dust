import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    workspaceId: {
      type: "string",
      describe: "The sId of the workspace owning the agent.",
      demandOption: true,
    },
    agentId: {
      type: "string",
      describe: "The sId of the agent configuration to scrub.",
      demandOption: true,
    },
  },
  async ({ workspaceId, agentId, execute }, logger) => {
    // Request all groups so archived agents living in restricted spaces are not
    // filtered out when listing their versions.
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
      dangerouslyRequestAllGroups: true,
    });

    const agent = await AgentResource.fetchById(auth, agentId);
    if (!agent) {
      logger.error({ workspaceId, agentId }, "Agent not found in workspace.");
      return;
    }

    // Archiving flips every version row sharing the `sId` to `archived`, so a
    // full purge must delete all versions, not just the latest one.
    const versions = await agent.listVersions(auth);

    if (!execute) {
      logger.info(
        {
          workspaceId,
          agentId,
          name: agent.name,
          scope: agent.scope,
          agentStatus: agent.status,
          versionCount: versions.length,
          versions: versions.map((v) => v.version),
        },
        "Would hard-delete all versions of the agent."
      );
      return;
    }

    logger.info(
      {
        workspaceId,
        agentId,
        name: agent.name,
        versionCount: versions.length,
      },
      "Hard-deleting all versions of the agent."
    );

    const deleteResult = await agent.delete(auth);
    if (deleteResult.isErr()) {
      throw deleteResult.error;
    }

    logger.info(
      { workspaceId, agentId, versionCount: versions.length },
      "Agent scrubbed successfully."
    );
  }
);
