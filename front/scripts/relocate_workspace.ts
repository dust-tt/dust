import { pauseAllManagedDataSources } from "@app/lib/api/data_sources";
import type { RegionType } from "@app/lib/api/regions/config";
import { config, SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import {
  setWorkspaceRelocated,
  setWorkspaceRelocating,
} from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import { launchWorkspaceRelocationWorkflow } from "@app/temporal/relocation/client";

const mode = {
  relocation: "relocation",
  relocationDone: "relocation-done",
};

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
    mode: {
      type: "string",
      choices: Object.values(mode),
      default: mode.relocation,
    },
  },
  async (
    { destinationRegion, sourceRegion, workspaceId, mode, execute },
    logger
  ) => {
    const currentRegion = config.getCurrentRegion();
    if (sourceRegion !== currentRegion) {
      logger.error(
        `Relocation must be run from the source region. Current region is ${currentRegion}.`
      );
      return;
    }

    if (sourceRegion === destinationRegion) {
      logger.error("Source and destination regions must be different.");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const owner = auth.getNonNullableWorkspace();

    logger.info("Start relocating workspace");

    if (execute) {
      switch (mode) {
        case "relocation":
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

        case "relocation-done":
          // 1) Set the workspace as relocated.
          const workspaceRelocatedRes = await setWorkspaceRelocated(owner);
          if (workspaceRelocatedRes.isErr()) {
            logger.error(
              `Failed to set workspace as relocated: ${workspaceRelocatedRes.error.message}`
            );
            return;
          }
          break;

        default:
          throw new Error(`Invalid mode: ${mode}`);
      }
    }
  }
);
