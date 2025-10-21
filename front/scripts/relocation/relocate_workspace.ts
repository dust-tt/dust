import { updateAllWorkspaceUsersRegionMetadata } from "@app/admin/relocate_users";
import {
  pauseAllManagedDataSources,
  unpauseAllManagedDataSources,
} from "@app/lib/api/data_sources";
import { pauseAllLabsWorkflows } from "@app/lib/api/labs";
import type { RegionType } from "@app/lib/api/regions/config";
import {
  config,
  isRegionType,
  SUPPORTED_REGIONS,
} from "@app/lib/api/regions/config";
import {
  deleteWorkspace,
  isWorkspaceRelocationDone,
  removeAllWorkspaceDomains,
  setWorkspaceRelocated,
  setWorkspaceRelocating,
  updateWorkspaceMetadata,
} from "@app/lib/api/workspace";
import { computeWorkspaceStatistics } from "@app/lib/api/workspace_statistics";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import { launchWorkspaceRelocationWorkflow } from "@app/temporal/relocation/client";
import { assertNever } from "@app/types";

const RELOCATION_STEPS = [
  "relocate",
  "cutover",
  "resume-in-destination",
  "rollback",
  "purge-in-source",
  "compute-statistics",
] as const;
type RelocationStep = (typeof RELOCATION_STEPS)[number];

function assertCorrectRegion(region: RegionType) {
  if (config.getCurrentRegion() !== region) {
    throw new Error(
      `Relocation must be run from ${region}. Current region is ${config.getCurrentRegion()}.`
    );
  }
}

makeScript(
  {
    workspaceId: {
      alias: "wId",
      type: "string",
      demandOption: true,
    },
    sourceRegion: {
      type: "string",
      choices: SUPPORTED_REGIONS,
      demandOption: true,
    },
    destinationRegion: {
      type: "string",
      choices: SUPPORTED_REGIONS,
      demandOption: true,
    },
    step: {
      type: "string",
      choices: RELOCATION_STEPS,
      demandOption: true,
    },
    forceUsersWithMultipleMemberships: {
      type: "boolean",
      required: false,
      default: false,
    },
  },
  async (
    {
      destinationRegion,
      sourceRegion,
      step,
      workspaceId,
      execute,
      forceUsersWithMultipleMemberships,
    },
    logger
  ) => {
    if (!isRegionType(sourceRegion) || !isRegionType(destinationRegion)) {
      logger.error("Invalid region.");
      return;
    }

    if (sourceRegion === destinationRegion) {
      logger.error("Source and destination regions must be different.");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const owner = auth.getNonNullableWorkspace();

    logger.info(`About to run step ${step} for workspace ${owner.sId}`);

    if (execute) {
      const s = step as RelocationStep;

      switch (s) {
        case "relocate":
          assertCorrectRegion(sourceRegion);

          // 1) Set the workspace as relocating.
          const workspaceRelocatingRes = await setWorkspaceRelocating(owner);
          if (workspaceRelocatingRes.isErr()) {
            logger.error(
              `Failed to set workspace as relocating: ${workspaceRelocatingRes.error.message}`
            );
            return;
          }

          // 2) Pause all connectors using the connectors API.
          const pauseRes = await pauseAllManagedDataSources(auth, {
            markAsError: true,
          });
          if (pauseRes.isErr()) {
            logger.error(
              `Failed to pause connectors: ${pauseRes.error.message}`
            );
            return;
          }

          // 3) Pause all labs workflows.
          const pauseLabsRes = await pauseAllLabsWorkflows(auth);
          if (pauseLabsRes.isErr()) {
            logger.error(
              `Failed to pause labs workflows: ${pauseLabsRes.error}`
            );
          }

          // 4) Launch the relocation workflow.
          await launchWorkspaceRelocationWorkflow({
            workspaceId: owner.sId,
            sourceRegion,
            destRegion: destinationRegion as RegionType,
          });
          break;

        case "cutover":
          assertCorrectRegion(sourceRegion);

          // 1) Set the workspace in the source region as relocated.
          const workspaceRelocatedRes = await setWorkspaceRelocated(owner);
          if (workspaceRelocatedRes.isErr()) {
            logger.error(
              `Failed to set workspace as relocated: ${workspaceRelocatedRes.error.message}`
            );
            return;
          }

          await removeAllWorkspaceDomains(owner);

          // 3) Update all users' region metadata.
          const updateUsersRegionToDestRes =
            await updateAllWorkspaceUsersRegionMetadata(auth, logger, {
              execute,
              newRegion: destinationRegion,
              forceUsersWithMultipleMemberships,
            });
          if (updateUsersRegionToDestRes.isErr()) {
            logger.error(
              `Failed to update users' region metadata: ${updateUsersRegionToDestRes.error.message}`
            );
            return;
          }
          break;

        case "resume-in-destination":
          assertCorrectRegion(destinationRegion);

          // 1) Remove the maintenance metadata.
          const clearDestWorkspaceMetadataRes = await updateWorkspaceMetadata(
            owner,
            {
              maintenance: undefined,
            }
          );
          if (clearDestWorkspaceMetadataRes.isErr()) {
            logger.error(
              `Failed to clear workspace metadata: ${clearDestWorkspaceMetadataRes.error.message}`
            );
            return;
          }

          // 2) Unpause all webcrawler connectors in the destination region.
          const unpauseDestConnectorsRes = await unpauseAllManagedDataSources(
            auth,
            ["webcrawler"]
          );
          if (unpauseDestConnectorsRes.isErr()) {
            logger.error(
              `Failed to unpause connectors: ${unpauseDestConnectorsRes.error.message}`
            );
            return;
          }

          break;

        case "rollback":
          assertCorrectRegion(sourceRegion);

          // 1) Clear workspace maintenance metadata in source region.
          const clearSrcWorkspaceMetadataRes =
            await setWorkspaceRelocated(owner);
          if (clearSrcWorkspaceMetadataRes.isErr()) {
            logger.error(
              `Failed to clear workspace maintenance metadata: ${clearSrcWorkspaceMetadataRes.error.message}`
            );
            return;
          }

          // 2) Unpause all connectors in the source region.
          const unpauseSrcConnectorsRes =
            await unpauseAllManagedDataSources(auth);
          if (unpauseSrcConnectorsRes.isErr()) {
            logger.error(
              `Failed to unpause connectors: ${unpauseSrcConnectorsRes.error.message}`
            );
            return;
          }

          // 3) Update all users' region metadata.
          const updateUsersRegionToSrcRes =
            await updateAllWorkspaceUsersRegionMetadata(auth, logger, {
              execute,
              newRegion: sourceRegion,
              forceUsersWithMultipleMemberships: false,
            });
          if (updateUsersRegionToSrcRes.isErr()) {
            logger.error(
              `Failed to update users' region metadata: ${updateUsersRegionToSrcRes.error.message}`
            );
            return;
          }

          break;

        case "purge-in-source":
          assertCorrectRegion(sourceRegion);

          // 1) Ensure workspace is fully relocated.
          if (!isWorkspaceRelocationDone(owner)) {
            logger.error("Workspace is not fully relocated.");
            return;
          }

          // 2) Delete the workspace in the source region.
          const deleteWorkspaceRes = await deleteWorkspace(owner, {
            workspaceHasBeenRelocated: true,
          });
          if (deleteWorkspaceRes.isErr()) {
            logger.error(
              `Failed to delete workspace: ${deleteWorkspaceRes.error.message}`
            );
            return;
          }

          logger.info("Workspace marked for deletion in source region.");
          break;

        // Can be run from any region.
        case "compute-statistics":
          const statsRes = await computeWorkspaceStatistics(auth);
          if (statsRes.isErr()) {
            logger.error(
              `Failed to compute workspace statistics: ${statsRes.error.message}`
            );
            return;
          }

          logger.info(
            `Workspace statistics in region ${config.getCurrentRegion()}:\n` +
              JSON.stringify(statsRes.value, null, 2)
          );
          break;

        default:
          assertNever(s);
      }
    }
  }
);
