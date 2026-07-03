import {
  listsAgentConfigurationVersions,
  unsafeHardDeleteAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
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

    // Archiving flips every version row sharing the `sId` to `archived`, so a
    // full purge must delete all versions, not just the latest one.
    const versions = await listsAgentConfigurationVersions(auth, {
      agentId,
      variant: "light",
    });

    if (versions.length === 0) {
      logger.error({ workspaceId, agentId }, "Agent not found in workspace.");
      return;
    }

    const [latest] = versions;

    if (!execute) {
      logger.info(
        {
          workspaceId,
          agentId,
          name: latest.name,
          scope: latest.scope,
          status: latest.status,
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
        name: latest.name,
        versionCount: versions.length,
      },
      "Hard-deleting all versions of the agent."
    );

    for (const version of versions) {
      await unsafeHardDeleteAgentConfiguration(auth, version);
      logger.info(
        { workspaceId, agentId, version: version.version },
        "Agent version hard-deleted."
      );
    }

    logger.info(
      { workspaceId, agentId, versionCount: versions.length },
      "Agent scrubbed successfully."
    );
  }
);
