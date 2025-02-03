import { assertNever } from "@dust-tt/types";

import {
  pauseAllManagedDataSources,
  unpauseAllManagedDataSources,
} from "@app/lib/api/data_sources";
import type { RegionType } from "@app/lib/api/regions/config";
import { config, SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import {
  setWorkspaceRelocated,
  setWorkspaceRelocating,
  updateWorkspaceMetadata,
} from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import { launchWorkspaceRelocationWorkflow } from "@app/temporal/relocation/client";

const RELOCATION_STEPS = [
  "relocate",
  "cutover",
  "resume-in-destination",
] as const;
type RelocationStep = (typeof RELOCATION_STEPS)[number];

function assertIsSourceRegion(region: string): asserts region is RegionType {
  if (region !== config.getCurrentRegion()) {
    throw new Error("Operation must be run from the source region.");
  }
}

function assertIsDestinationRegion(
  region: string
): asserts region is RegionType {
  if (region !== config.getCurrentRegion()) {
    throw new Error("Operation must be run from the destination region.");
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
    if (sourceRegion === destinationRegion) {
      logger.error("Source and destination regions must be different.");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const owner = auth.getNonNullableWorkspace();

    logger.info("Start relocating workspace");

    if (execute) {
      const s = step as RelocationStep;

      switch (s) {
        case "relocate":
          assertIsSourceRegion(sourceRegion);

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
          assertIsSourceRegion(sourceRegion);

          // 1) Set the workspace as relocated.
          const workspaceRelocatedRes = await setWorkspaceRelocated(owner);
          if (workspaceRelocatedRes.isErr()) {
            logger.error(
              `Failed to set workspace as relocated: ${workspaceRelocatedRes.error.message}`
            );
            return;
          }
          break;

        case "resume-in-destination":
          assertIsDestinationRegion(destinationRegion);

          if (config.getCurrentRegion() !== destinationRegion) {
            logger.error(
              `Resume-in-destination must be run from the destination region. Current region is ${config.getCurrentRegion()}.`
            );
            return;
          }

          // 1) Unpause all connectors in the destination region.
          const unpauseRes = await unpauseAllManagedDataSources(auth);
          if (unpauseRes.isErr()) {
            logger.error(
              `Failed to unpause connectors: ${unpauseRes.error.message}`
            );
            return;
          }

          // 2) Remove the maintenance metadata.
          const clearWorkspaceMetadataRes = await updateWorkspaceMetadata(
            owner,
            {
              maintenance: undefined,
            }
          );
          if (clearWorkspaceMetadataRes.isErr()) {
            logger.error(
              `Failed to clear workspace metadata: ${clearWorkspaceMetadataRes.error.message}`
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
