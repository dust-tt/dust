import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

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

  // This targets regular spaces that are open: a regular space whose groups include the workspace
  // global group as a `reader` viewer. Soft-deleted spaces are left out (default scope).
  const spaces = await SpaceResource.listWorkspaceSpaces(auth);
  const openIds = await SpaceResource.listOpenSpaceModelIds(auth, spaces);
  const openRegularSpaces = spaces.filter(
    (space) => space.isRegular() && openIds.has(space.id)
  );
  // Counts for every stage, logged once at the end: a run that removes nothing has to say which
  // stage came up empty, or a no-op is indistinguishable from a bug.
  const counts = {
    spaces: spaces.length,
    openRegularSpaces: openRegularSpaces.length,
    memberGroups: 0,
    groupMembers: 0,
    removed: 0,
  };
  const report = () =>
    logger.info(
      { workspaceId: workspace.sId, execute, ...counts },
      "Open regular space member reset"
    );

  if (openRegularSpaces.length === 0) {
    report();
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
  counts.memberGroups = memberGroups.length;
  if (memberGroups.length === 0) {
    report();
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
  counts.groupMembers = allUserModelIds.length;
  if (allUserModelIds.length === 0) {
    report();
    return;
  }
  // Resolved for the audit log only. Membership is deliberately not a precondition: a group
  // membership outlives the workspace membership it came with, and those rows are exactly the ones
  // worth clearing — the user regains the group, and with it write on the space, if they rejoin.
  const users = await UserResource.fetchByModelIds(allUserModelIds);
  const usersByModelId = new Map(users.map((user) => [user.id, user]));

  const now = new Date();
  for (const group of memberGroups) {
    const userModelIds = userModelIdsByGroupModelId[group.id] ?? [];
    if (userModelIds.length === 0) {
      continue;
    }

    const space = spaceByGroupModelId.get(group.id);
    const context = {
      workspaceId: workspace.sId,
      spaceId: space?.sId,
      groupId: group.sId,
      userIds: removeNulls(
        userModelIds.map((id) => usersByModelId.get(id)?.sId ?? null)
      ),
    };

    if (!execute) {
      logger.info(context, "Dry run: would remove members of an open space");
      counts.removed += userModelIds.length;
      continue;
    }

    // `GroupResource.dangerouslyRemoveMembers` would refuse the whole batch as soon as one user has
    // left the workspace, so the rows are ended here the same way it ends them, followed by the
    // per-user group cache invalidation it would have done.
    await GroupMembershipModel.update(
      { endAt: now },
      {
        where: {
          groupId: group.id,
          userId: userModelIds,
          workspaceId: workspace.id,
          status: "active",
          startAt: { [Op.lte]: now },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
        },
      }
    );
    for (const userModelId of userModelIds) {
      await GroupResource.invalidateGroupIdsCacheForUser({
        user: { id: userModelId },
        workspace: { id: workspace.id },
      });
    }

    logger.info(context, "Removed members of an open space");
    counts.removed += userModelIds.length;
  }

  report();
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting open regular space member reset");

    await runOnAllWorkspaces(
      async (workspace) => {
        await resetWorkspaceOpenSpaceMembers(execute, logger, workspace);
      },
      { concurrency: 4, wId }
    );

    logger.info("Open regular space member reset completed");
  }
);
