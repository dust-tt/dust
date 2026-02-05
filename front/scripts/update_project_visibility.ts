import parseArgs from "minimist";

import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceViewerResource } from "@app/lib/resources/group_space_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import logger from "@app/logger/logger";

/**
 * Script to update project visibility for testing search_spaces endpoint.
 *
 * Usage:
 *   npx tsx admin/update_project_visibility.ts --wId=<workspace_id> [--execute]
 *
 * Arguments:
 *   --wId (required): Workspace ID
 *   --execute (optional): Actually perform changes (dry-run by default)
 *
 * Logic:
 *   - Even-indexed projects (0, 2, 4...): Make public (isRestricted: false)
 *   - Odd-indexed projects (1, 3, 5...): Make restricted (isRestricted: true)
 */

async function main() {
  const argv = parseArgs(process.argv.slice(2));

  if (!argv.wId) {
    throw new Error("Missing --wId argument");
  }

  const wId = String(argv.wId);
  const execute = Boolean(argv.execute);

  if (!execute) {
    logger.info(
      "[DRY RUN] Use --execute to actually perform changes. Running in dry-run mode."
    );
  }

  // Get admin authenticator for workspace
  const auth = await Authenticator.internalAdminForWorkspace(wId);
  const workspace = auth.getNonNullableWorkspace();

  logger.info({ workspaceId: workspace.sId }, "Fetching project spaces");

  // List all spaces including projects
  const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeProjectSpaces: true,
  });

  // Filter to only project spaces
  const projectSpaces = spaces.filter((s) => s.kind === "project");

  if (projectSpaces.length === 0) {
    logger.info("No project spaces found in workspace");
    return;
  }

  logger.info(
    { projectCount: projectSpaces.length },
    "Found project spaces to update"
  );

  // Get global group for the workspace
  const globalGroupResult = await GroupResource.fetchWorkspaceGlobalGroup(auth);
  if (globalGroupResult.isErr()) {
    throw new Error(
      `Failed to fetch global group: ${globalGroupResult.error.message}`
    );
  }
  const globalGroup = globalGroupResult.value;

  // Process each project
  for (let i = 0; i < projectSpaces.length; i++) {
    const space = projectSpaces[i];
    const shouldBePublic = i % 2 === 0; // Even index = public, odd = restricted
    const isCurrentlyPublic = space.isOpen();

    const targetVisibility = shouldBePublic ? "public" : "restricted";
    const currentVisibility = isCurrentlyPublic ? "public" : "restricted";

    const localLogger = logger.child({
      projectName: space.name,
      projectSId: space.sId,
      index: i,
      currentVisibility,
      targetVisibility,
    });

    if (shouldBePublic === isCurrentlyPublic) {
      localLogger.info("Project already has correct visibility, skipping");
      continue;
    }

    if (shouldBePublic && !isCurrentlyPublic) {
      // Make public: Add global group as viewer
      localLogger.info("Making project public (adding global group as viewer)");

      if (execute) {
        await GroupSpaceViewerResource.makeNew(auth, {
          group: globalGroup,
          space,
        });
        localLogger.info("Project made public");
      } else {
        localLogger.info("[DRY RUN] Would make project public");
      }
    } else if (!shouldBePublic && isCurrentlyPublic) {
      // Make restricted: Remove global group
      localLogger.info(
        "Making project restricted (removing global group viewer)"
      );

      if (execute) {
        // Remove all global group associations from this space
        await GroupSpaceModel.destroy({
          where: {
            groupId: globalGroup.id,
            vaultId: space.id,
            workspaceId: workspace.id,
          },
        });
        localLogger.info("Project made restricted");
      } else {
        localLogger.info("[DRY RUN] Would make project restricted");
      }
    }
  }

  logger.info("Project visibility update completed");
}

main()
  .then(() => {
    logger.info("Done");
    process.exit(0);
  })
  .catch((err) => {
    logger.error({ error: err }, `Error: ${err.message}`);
    process.exit(1);
  });
