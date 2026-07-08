import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  PROJECT_EDITOR_GROUP_PREFIX,
  PROJECT_GROUP_PREFIX,
  SPACE_GROUP_PREFIX,
} from "@app/types/groups";

const LOG_EVERY_N_WORKSPACES = 500;

makeScript(
  {
    fromModelId: {
      type: "number",
      describe: "Only process workspaces with a model id >= this value",
    },
  },
  async ({ execute, fromModelId }) => {
    const erroredWorkspaceIds: number[] = [];
    let processedCount = 0;

    await runOnAllWorkspaces(
      async (w) => {
        try {
          const auth = await Authenticator.internalAdminForWorkspace(w.sId);
          const pods = await SpaceResource.listProjectSpaces(auth);
          for (const pod of pods) {
            const regularGroups = pod.groups.filter((g) => g.isRegular());
            if (regularGroups.length === 1) {
              const group = regularGroups[0];
              const newName = `${pod.isProject() ? PROJECT_GROUP_PREFIX : SPACE_GROUP_PREFIX} ${pod.name}`;
              if (execute) {
                await group.updateName(auth, newName);
              } else {
                logger.info(
                  `[Execute: ${execute}] Updating group ${group.id} to "${newName}"`
                );
              }
            }

            const spaceEditorsGroups = pod.groups.filter(
              (g) => g.kind === "space_editors"
            );
            if (spaceEditorsGroups.length === 1) {
              const group = spaceEditorsGroups[0];
              const newName = `${PROJECT_EDITOR_GROUP_PREFIX} ${pod.name}`;
              if (execute) {
                await group.updateName(auth, newName);
              } else {
                logger.info(
                  `[Execute: ${execute}] Updating group ${group.id} to "${newName}"`
                );
              }
            }
          }
        } catch (err) {
          erroredWorkspaceIds.push(w.id);
          logger.error(
            { workspaceId: w.id, err: normalizeError(err) },
            `Failed to process workspace ${w.name}, continuing`
          );
        } finally {
          processedCount += 1;
          if (processedCount % LOG_EVERY_N_WORKSPACES === 0) {
            logger.info(
              {
                processedCount,
                lastProcessedWorkspaceId: w.id,
                erroredWorkspaceIds,
              },
              `Processed ${processedCount} workspaces (last id: ${w.id}, ${erroredWorkspaceIds.length} errored)`
            );
          }
        }
      },
      { fromWorkspaceId: fromModelId }
    );

    logger.info(
      { processedCount, erroredWorkspaceIds },
      `Done. Processed ${processedCount} workspaces, ${erroredWorkspaceIds.length} errored`
    );
  }
);
