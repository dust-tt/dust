import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

// Adds every active admin and manager to the member group of each open regular space, so they keep
// write on it now that the role no longer grants any (see `spaceRoleGrants`).
//
// Only manually-managed spaces are touched: a group-managed one has been configured deliberately,
// and its access is whatever groups the admin picked.
//
// This is a snapshot, not a rule: someone promoted to manager afterwards is not added. Admins can
// still fix that themselves (they keep `admin` on every space), managers cannot.
//
// Idempotent: users already in the group are skipped.
async function backfillWorkspaceOpenSpaceMembers(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const spaces = await SpaceResource.listWorkspaceSpaces(auth);
  const targets = spaces.filter(
    (space) => space.isRegularAndOpen() && space.managementMode === "manual"
  );

  // Counts for every stage, logged once: a run that adds nothing has to say which stage came up
  // empty, or a no-op is indistinguishable from a bug.
  const counts = {
    spaces: spaces.length,
    openManualSpaces: targets.length,
    adminsAndManagers: 0,
    added: 0,
  };
  const report = () =>
    logger.info(
      { workspaceId: workspace.sId, execute, ...counts },
      "Open regular space admin/manager backfill"
    );

  if (targets.length === 0) {
    report();
    return;
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
    roles: ["admin", "manager"],
  });
  const userModelIds = [...new Set(memberships.map((m) => m.userId))];
  counts.adminsAndManagers = userModelIds.length;
  if (userModelIds.length === 0) {
    report();
    return;
  }

  const users = await UserResource.fetchByModelIds(userModelIds);

  for (const space of targets) {
    // A regular space has exactly one auto-created member group; anything else is a shape this
    // script should not guess at.
    const autoGroups = await space.fetchRegularAutoGroups(auth);
    if (autoGroups.length !== 1) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          spaceId: space.sId,
          memberGroups: autoGroups.length,
        },
        "Skipping space: expected exactly one member group"
      );
      continue;
    }
    const memberGroup = autoGroups[0];

    // `dangerouslyAddMembers` rejects the whole batch if any user is already a member.
    const currentMembers = await memberGroup.getActiveMembers(auth);
    const currentUserModelIds = new Set(currentMembers.map((user) => user.id));
    const usersToAdd = users.filter(
      (user) => !currentUserModelIds.has(user.id)
    );
    if (usersToAdd.length === 0) {
      continue;
    }

    const context = {
      workspaceId: workspace.sId,
      spaceId: space.sId,
      groupId: memberGroup.sId,
      userIds: usersToAdd.map((user) => user.sId),
    };

    if (!execute) {
      logger.info(
        context,
        "Dry run: would add admins/managers to an open space"
      );
      counts.added += usersToAdd.length;
      continue;
    }

    const res = await memberGroup.dangerouslyAddMembers(auth, {
      users: usersToAdd.map((user) => user.toJSON()),
    });
    if (res.isErr()) {
      logger.error(
        { ...context, error: res.error },
        "Failed to add admins/managers to an open space"
      );
      continue;
    }

    logger.info(context, "Added admins/managers to an open space");
    counts.added += usersToAdd.length;
  }

  report();
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting open regular space admin/manager backfill");

    if (wId) {
      const workspace = await WorkspaceResource.fetchById(wId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await backfillWorkspaceOpenSpaceMembers(
        execute,
        logger,
        renderLightWorkspaceType({ workspace })
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await backfillWorkspaceOpenSpaceMembers(execute, logger, workspace);
        },
        { concurrency: 4 }
      );
    }

    logger.info("Open regular space admin/manager backfill completed");
  }
);
