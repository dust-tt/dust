import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import {
  PROJECT_EDITOR_GROUP_PREFIX,
  PROJECT_GROUP_PREFIX,
  SPACE_GROUP_PREFIX,
} from "@app/types";

makeScript({}, async ({ execute }) => {
  await runOnAllWorkspaces(async (w) => {
    const auth = await Authenticator.internalAdminForWorkspace(w.sId);
    const allSpaces = await SpaceResource.listWorkspaceSpaces(auth);
    const regularSpaces = allSpaces.filter((s) => s.kind === "regular");
    logger.info(
      `Found ${regularSpaces.length} regular spaces for workspace ${w.name}`
    );
    for (const space of regularSpaces) {
      const regularGroups = space.groups.filter((g) => g.isRegular());
      if (regularGroups.length === 1) {
        const group = regularGroups[0];
        if (execute) {
          await group.updateName(
            auth,
            `${space.isProject() ? PROJECT_GROUP_PREFIX : SPACE_GROUP_PREFIX} ${space.name}`
          );
        }
        logger.info(
          `[Execute: ${execute}] Updating group ${group.id} to "${space.isProject() ? PROJECT_GROUP_PREFIX : SPACE_GROUP_PREFIX} ${space.name}"`
        );
      }

      const spaceEditorsGroups = space.groups.filter(
        (g) => g.kind === "space_editors"
      );
      if (spaceEditorsGroups.length === 1) {
        const group = spaceEditorsGroups[0];
        if (execute) {
          await group.updateName(
            auth,
            `${PROJECT_EDITOR_GROUP_PREFIX} ${space.name}`
          );
        }
        logger.info(
          `[Execute: ${execute}] Updating group ${group.id} to "${PROJECT_EDITOR_GROUP_PREFIX} ${space.name}"`
        );
      }
    }
    logger.info(`Done for workspace ${w.name}`);
  });
});
