import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

// Creates the missing member group of each workspace's global space (Company Data), so admins can
// grant write on it to people who are neither admins nor managers (see
// `SpaceResource.spaceGroupRoles`). Global spaces created before this feature only carry the
// workspace global group's `reader` grant.
//
// The group is created empty: nobody gains write from the backfill, since write already comes from
// the `admin` / `manager` / legacy `builder` roles.
//
// Idempotent: a global space that already has a `regular_auto` group is left untouched.
async function backfillWorkspaceGlobalSpaceMemberGroup(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // A workspace with no global space at all is a pre-existing inconsistency this backfill must not
  // turn into a failed run (`fetchWorkspaceGlobalSpace` throws).
  let globalSpace: SpaceResource;
  try {
    globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  } catch (err) {
    logger.error(
      { workspaceId: workspace.sId, error: normalizeError(err).message },
      "Skipping workspace: no global space"
    );
    return;
  }

  const context = {
    workspaceId: workspace.sId,
    spaceId: globalSpace.sId,
    spaceName: globalSpace.name,
  };

  const autoGroups = await globalSpace.fetchRegularAutoGroups(auth);
  if (autoGroups.length > 0) {
    logger.info(
      { ...context, groupIds: autoGroups.map((group) => group.sId) },
      "Global space already has a member group, skipping"
    );
    return;
  }

  if (!execute) {
    logger.info(context, "Dry run: would create the global space member group");
    return;
  }

  try {
    await globalSpace.ensureGlobalSpaceMemberGroup(auth);
    logger.info(context, "Created the global space member group");
  } catch (err) {
    // A name collision (a leftover group already named after the global space) is the one failure
    // an operator has to resolve by hand; it is reported per workspace rather than aborting the run.
    logger.error(
      { ...context, error: normalizeError(err).message },
      "Failed to create the global space member group"
    );
  }
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting global space member group backfill");

    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillWorkspaceGlobalSpaceMemberGroup(
          execute,
          logger,
          workspace
        );
      },
      { concurrency: 4, wId }
    );

    logger.info("Global space member group backfill completed");
  }
);
