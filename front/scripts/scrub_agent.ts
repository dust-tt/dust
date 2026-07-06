import {
  cleanupAgentScopedResourcesForHardDeletion,
  listsAgentConfigurationVersions,
  unsafeHardDeleteAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentUserRelationModel } from "@app/lib/models/agent/agent";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
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

    // Clean up the agent-scoped resources keyed by the sId (triggers, wake-ups
    // and their Temporal schedules, favorites) once before deleting the version
    // rows: they are shared across all versions, not per-version. This is
    // best-effort: it intentionally keeps rows whose Temporal cleanup failed so
    // they can be retried.
    await cleanupAgentScopedResourcesForHardDeletion(auth, agentId);

    // Verify the cleanup actually removed everything before deleting the version
    // rows. Deleting the versions is irreversible and removes the only handle to
    // re-run this script, so if any scoped row survived (its Temporal cleanup
    // failed and it was kept for retry) we abort and leave the agent intact so a
    // rerun can finish the job once the underlying issue is resolved.
    const [remainingTriggers, remainingWakeUps, remainingFavorites] =
      await Promise.all([
        TriggerResource.listByAgentConfigurationId(auth, agentId),
        WakeUpResource.listByAgentConfigurationId(auth, agentId),
        AgentUserRelationModel.findAll({
          where: {
            agentConfiguration: agentId,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
        }),
      ]);

    if (
      remainingTriggers.length > 0 ||
      remainingWakeUps.length > 0 ||
      remainingFavorites.length > 0
    ) {
      logger.error(
        {
          workspaceId,
          agentId,
          remainingTriggerIds: remainingTriggers.map((t) => t.sId),
          remainingWakeUps: remainingWakeUps.map((w) => ({
            sId: w.sId,
            status: w.status,
            scheduleType: w.scheduleType,
          })),
          remainingFavoriteCount: remainingFavorites.length,
        },
        "Agent scoped cleanup incomplete; aborting hard-delete of agent versions. " +
          "Resolve the underlying Temporal failure and rerun."
      );
      throw new Error(
        `Agent scoped cleanup incomplete for ${agentId}; aborted before deleting versions.`
      );
    }

    logger.info(
      { workspaceId, agentId },
      "Agent triggers, wake-ups and favorites fully cleaned up."
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
