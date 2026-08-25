import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";

// Empties the member group of every open regular space, so open spaces start from a clean slate now
// that their members confer write (see `spaceGroupRoles`).
//
// Members conferred nothing on an open space before, and the settings panel did not show them, but
// a space that was restricted and later opened kept its list. Left alone, those leftovers would
// silently gain write on the next save.
//
// Only the space's own `regular_auto` group is emptied: provisioned groups are IdP-owned and shared
// across spaces. Grants are untouched — with no members they confer nothing either way, and the
// next `writeGroupPermissions` converges them. Idempotent.
async function resetWorkspaceOpenSpaceMembers(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // `isRegularAndOpen` is the predicate this targets: a regular space whose groups include the
  // workspace global group as a `reader` viewer. Soft-deleted spaces are left out (default scope).
  const spaces = await SpaceResource.listWorkspaceSpaces(auth);
  const openRegularSpaces = spaces.filter((space) => space.isRegularAndOpen());
  if (openRegularSpaces.length === 0) {
    return;
  }

  // Resolved in bulk rather than per space: one query for the groups, one for their memberships.
  const groupModelIds = [
    ...new Set(
      openRegularSpaces.flatMap((space) =>
        space.groups.map((ref) => ref.groupId)
      )
    ),
  ];
  const memberGroups = await GroupResource.fetchByModelIds(
    auth,
    groupModelIds,
    {
      groupKinds: ["regular_auto"],
    }
  );
  if (memberGroups.length === 0) {
    return;
  }

  const spaceByGroupModelId = new Map(
    openRegularSpaces.flatMap((space) =>
      space.groups.map((ref) => [ref.groupId, space] as const)
    )
  );

  const userModelIdsByGroupModelId =
    await GroupResource.getActiveMembershipsForGroups(auth, memberGroups);
  const allUserModelIds = [
    ...new Set(Object.values(userModelIdsByGroupModelId).flat()),
  ];
  if (allUserModelIds.length === 0) {
    return;
  }
  const users = await UserResource.fetchByModelIds(allUserModelIds);

  // `dangerouslyRemoveMembers` rejects the whole batch if any user is no longer an active member of
  // the workspace, and a group membership outlives the workspace membership it came with. Drop
  // those users here: without an active workspace membership their groups do not resolve, so they
  // hold no access to strip anyway.
  const { memberships } = await MembershipResource.getActiveMemberships({
    users,
    workspace,
  });
  const activeUserModelIds = new Set(memberships.map((m) => m.userId));
  const usersByModelId = new Map(
    users
      .filter((user) => activeUserModelIds.has(user.id))
      .map((user) => [user.id, user])
  );

  let removed = 0;
  for (const group of memberGroups) {
    const members = removeNulls(
      (userModelIdsByGroupModelId[group.id] ?? []).map(
        (userModelId) => usersByModelId.get(userModelId) ?? null
      )
    );
    if (members.length === 0) {
      continue;
    }

    const space = spaceByGroupModelId.get(group.id);
    const context = {
      workspaceId: workspace.sId,
      spaceId: space?.sId,
      groupId: group.sId,
      userIds: members.map((user) => user.sId),
    };

    if (!execute) {
      logger.info(context, "Dry run: would remove members of an open space");
      removed += members.length;
      continue;
    }

    const res = await group.dangerouslyRemoveMembers(auth, {
      users: members.map((user) => user.toJSON()),
    });
    if (res.isErr()) {
      logger.error(
        { ...context, error: res.error },
        "Failed to remove members of an open space"
      );
      continue;
    }

    logger.info(context, "Removed members of an open space");
    removed += members.length;
  }

  if (removed > 0) {
    logger.info(
      {
        workspaceId: workspace.sId,
        openRegularSpaces: openRegularSpaces.length,
        removed,
        execute,
      },
      "Reset open regular space members"
    );
  }
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting open regular space member reset");

    if (wId) {
      const workspace = await WorkspaceResource.fetchById(wId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await resetWorkspaceOpenSpaceMembers(
        execute,
        logger,
        renderLightWorkspaceType({ workspace })
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await resetWorkspaceOpenSpaceMembers(execute, logger, workspace);
        },
        { concurrency: 4 }
      );
    }

    logger.info("Open regular space member reset completed");
  }
);
