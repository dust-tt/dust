import { updateWorkspaceWorkOSMetadata } from "@app/admin/relocate_users";
import { config as cellConfig } from "@app/lib/api/cells/config";
import { invalidateWorkspaceCellCache } from "@app/lib/api/cells/lookup";
import {
  pauseAllManagedDataSources,
  unpauseAllManagedDataSources,
} from "@app/lib/api/data_sources";
import {
  pauseAllLabsWorkflows,
  unpauseAllLabsWorkflows,
} from "@app/lib/api/labs";
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
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { makeScript } from "@app/scripts/helpers";
import { invalidateRelocatedWorkspaceCaches } from "@app/scripts/relocation/cache";
import { launchWorkspaceRelocationWorkflow } from "@app/temporal/relocation/client";
import type { CellType } from "@app/types/cell";
import { isCellType, SUPPORTED_CELLS } from "@app/types/cell";
import { assertNever } from "@app/types/shared/utils/assert_never";

const RELOCATION_STEPS = [
  "relocate",
  "cutover",
  "resume-in-destination",
  "rollback",
  "purge-in-source",
  "compute-statistics",
] as const;
type RelocationStep = (typeof RELOCATION_STEPS)[number];

function assertCurrentCell(cell: CellType) {
  if (cellConfig.getCurrentCell().name !== cell) {
    throw new Error(
      `Relocation must be run from ${cell}. Current cell is ${cellConfig.getCurrentCell().name}.`
    );
  }
}

async function invalidateLookupCache(workspaceId: string) {
  await invalidateWorkspaceCellCache(workspaceId);
}

makeScript(
  {
    workspaceId: {
      alias: "wId",
      type: "string",
      demandOption: true,
    },
    sourceCell: {
      type: "string",
      choices: SUPPORTED_CELLS,
      demandOption: true,
    },
    destinationCell: {
      type: "string",
      choices: SUPPORTED_CELLS,
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
    { destinationCell, sourceCell, step, workspaceId, execute },
    logger
  ) => {
    logger.warn(
      "Note: the relocation script does NOT support moving between cells within the same region."
    );

    if (!isCellType(sourceCell) || !isCellType(destinationCell)) {
      logger.error("Invalid cell.");
      return;
    }

    if (sourceCell === destinationCell) {
      logger.error("Source and destination cells must be different.");
      return;
    }

    // Relocation writes directly to the destination database, bypassing the
    // Resource mutation paths that normally invalidate these caches. Clear
    // them before building the authenticator so it cannot retain the
    // synthetic FREE subscription produced while the copy was incomplete.
    if (execute && step === "resume-in-destination") {
      assertCurrentCell(destinationCell);
      await invalidateRelocatedWorkspaceCaches(workspaceId);
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const owner = auth.getNonNullableWorkspace();

    logger.info(`About to run step ${step} for workspace ${owner.sId}`);

    if (execute) {
      const s = step as RelocationStep;

      switch (s) {
        case "relocate":
          assertCurrentCell(sourceCell);

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

          // 3) Pause all triggers.
          const triggerRes = await TriggerResource.disableAllForWorkspace(
            auth,
            "relocating"
          );
          if (triggerRes.isErr()) {
            logger.error(
              {
                workspaceId: auth.getNonNullableWorkspace().sId,
                error: triggerRes.error,
              },
              "Failed to disable workspace triggers during relocation."
            );
          }

          // 4) Pause all labs workflows.
          const pauseLabsRes = await pauseAllLabsWorkflows(auth, "relocating");
          if (pauseLabsRes.isErr()) {
            logger.error(
              `Failed to pause labs workflows: ${pauseLabsRes.error}`
            );
          }

          // 5) Launch the relocation workflow.
          await launchWorkspaceRelocationWorkflow({
            workspaceId: owner.sId,
            sourceRegion: cellConfig.getCellInfo(sourceCell).region,
            destRegion: cellConfig.getCellInfo(destinationCell).region,
          });
          break;

        case "cutover":
          assertCurrentCell(sourceCell);

          // 1) Set the workspace in the source region as relocated.
          const workspaceRelocatedRes = await setWorkspaceRelocated(owner);
          if (workspaceRelocatedRes.isErr()) {
            logger.error(
              `Failed to set workspace as relocated: ${workspaceRelocatedRes.error.message}`
            );
            return;
          }

          await removeAllWorkspaceDomains(owner);

          // 2) Invalidate lookup cache so lookups re-resolve.
          await invalidateLookupCache(owner.sId);

          // 3) Update workos metadata.
          const updateWorkosMetadataToDestRes =
            await updateWorkspaceWorkOSMetadata(auth, logger, {
              execute,
              newCell: destinationCell,
            });
          if (updateWorkosMetadataToDestRes.isErr()) {
            logger.error(
              `Failed to update workos metadata: ${updateWorkosMetadataToDestRes.error.message}`
            );
            return;
          }
          break;

        case "resume-in-destination":
          assertCurrentCell(destinationCell);

          // 1) Invalidate lookup cache so lookups re-resolve.
          await invalidateLookupCache(owner.sId);

          // 2) Remove the maintenance metadata.
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

          // 3) Unpause all webcrawler connectors in the destination region.
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

          // 4) Unpause all triggers.
          const unpauseDestTriggerRes =
            await TriggerResource.enableAllForWorkspace(auth, "relocating");
          if (unpauseDestTriggerRes.isErr()) {
            logger.error(
              {
                workspaceId: auth.getNonNullableWorkspace().sId,
                error: unpauseDestTriggerRes.error,
              },
              "Failed to re-enable workspace triggers after relocation."
            );
          }

          // 5) Unpause all labs workflows.
          const unpauseDestLabsRes = await unpauseAllLabsWorkflows(
            auth,
            "relocating"
          );
          if (unpauseDestLabsRes.isErr()) {
            logger.error(
              {
                workspaceId: auth.getNonNullableWorkspace().sId,
                error: unpauseDestLabsRes.error,
              },
              "Failed to re-enable workspace labs workflows after relocation."
            );
          }

          break;

        case "rollback":
          assertCurrentCell(sourceCell);

          // 1) Clear workspace maintenance metadata in source region.
          const clearSrcWorkspaceMetadataRes = await updateWorkspaceMetadata(
            owner,
            {
              maintenance: undefined,
            }
          );
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

          // 3) Unpause all triggers.
          const unpauseTriggerRes = await TriggerResource.enableAllForWorkspace(
            auth,
            "relocating"
          );
          if (unpauseTriggerRes.isErr()) {
            logger.error(
              {
                workspaceId: auth.getNonNullableWorkspace().sId,
                error: unpauseTriggerRes.error,
              },
              "Failed to re-enable workspace triggers after relocation rollback."
            );
          }

          // 4) Unpause all labs workflows.
          const unpauseLabsRes = await unpauseAllLabsWorkflows(
            auth,
            "relocating"
          );
          if (unpauseLabsRes.isErr()) {
            logger.error(
              {
                workspaceId: auth.getNonNullableWorkspace().sId,
                error: unpauseLabsRes.error,
              },
              "Failed to re-enable workspace labs workflows after relocation rollback."
            );
          }

          // 5) Update workos metadata.
          const updateWorkosMetadataToSrcRes =
            await updateWorkspaceWorkOSMetadata(auth, logger, {
              execute,
              newCell: sourceCell,
            });
          if (updateWorkosMetadataToSrcRes.isErr()) {
            logger.error(
              `Failed to update workos metadata: ${updateWorkosMetadataToSrcRes.error.message}`
            );
            return;
          }

          break;

        case "purge-in-source":
          assertCurrentCell(sourceCell);

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
            `Workspace statistics in cell ${cellConfig.getCurrentCell().name}:\n` +
              JSON.stringify(statsRes.value, null, 2)
          );
          break;

        default:
          assertNever(s);
      }
    }
  }
);
