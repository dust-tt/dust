import { updateAllWorkspaceUsersRegionMetadata } from "@app/admin/relocate_users";
import {
  pauseAllManagedDataSources,
  resumeAllManagedDataSources,
} from "@app/lib/api/data_sources";
import type { RegionType } from "@app/lib/api/regions/config";
import {
  config,
  isRegionType,
  SUPPORTED_REGIONS,
} from "@app/lib/api/regions/config";
import {
  setWorkspaceRelocated,
  setWorkspaceRelocating,
  updateWorkspaceMetadata,
} from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import { launchWorkspaceRelocationWorkflow } from "@app/temporal/relocation/client";
import { assertNever } from "@app/types";

const RELOCATION_STEPS = [
  "relocate",
  "cutover",
  "resume-in-destination",
  "rollback",
] as const;
type RelocationStep = (typeof RELOCATION_STEPS)[number];

const AUTH0_DEFAULT_RATE_LIMIT_THRESHOLD = 3;

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
  },
  async (
    { destinationRegion, sourceRegion, step, workspaceId, execute },
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

          // 3) Launch the relocation workflow.
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

          // 3) Update all users' region metadata.
          const updateUsersRegionToDestRes =
            await updateAllWorkspaceUsersRegionMetadata(auth, logger, {
              execute,
              newRegion: destinationRegion,
              rateLimitThreshold: AUTH0_DEFAULT_RATE_LIMIT_THRESHOLD,
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

          // 2) Resume all webcrawler connectors in the destination region.
          const resumeDestConnectorsRes = await resumeAllManagedDataSources(
            auth,
            ["webcrawler"]
          );
          if (resumeDestConnectorsRes.isErr()) {
            logger.error(
              `Failed to resume connectors: ${resumeDestConnectorsRes.error.message}`
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

          // 2) Resume all connectors in the source region.
          const resumeSrcConnectorsRes =
            await resumeAllManagedDataSources(auth);
          if (resumeSrcConnectorsRes.isErr()) {
            logger.error(
              `Failed to resume connectors: ${resumeSrcConnectorsRes.error.message}`
            );
            return;
          }

          // 3) Update all users' region metadata.
          const updateUsersRegionToSrcRes =
            await updateAllWorkspaceUsersRegionMetadata(auth, logger, {
              execute,
              newRegion: sourceRegion,
              rateLimitThreshold: AUTH0_DEFAULT_RATE_LIMIT_THRESHOLD,
            });
          if (updateUsersRegionToSrcRes.isErr()) {
            logger.error(
              `Failed to update users' region metadata: ${updateUsersRegionToSrcRes.error.message}`
            );
            return;
          }

          break;

        default:
          assertNever(s);
      }
    }
  }
);
