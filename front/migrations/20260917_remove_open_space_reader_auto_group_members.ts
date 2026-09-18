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

// Empties the `regular_auto` group of every open regular space whose auto group still holds a
// `reader` grant on the space.
//
// Members conferred nothing on an open space historically, but a space that was restricted and
// later opened kept its member list. Those leftovers sit in the auto group behind a `reader` grant.
// `20260825_reset_open_space_members` was meant to clear them everywhere but was not run on every
// workspace, and since then open spaces have gained legitimate members (auto group holding a
// `member` grant). `20260915_fix_regular_auto_group_reader_grants` cannot simply flip `reader` to
// `member` without silently promoting the leftovers, so the leftovers are removed here first.
//
// Scope: open regular spaces (workspace global group as `reader` viewer) whose own `regular_auto`
// group holds a `reader` grant. Provisioned groups are untouched. Grants are untouched: with no
// members they confer nothing, and the grant fix converges them afterwards. Idempotent.
//
// Silent on workspaces with nothing to remove, so a run across all workspaces only prints the ones
// that matter.
export async function removeWorkspaceStaleOpenSpaceMembers(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const spaces = await SpaceResource.listWorkspaceSpaces(auth);
  const openIds = await SpaceResource.listOpenSpaceModelIds(auth, spaces);
  const openRegularSpaces = spaces.filter(
    (space) => space.isRegular() && openIds.has(space.id)
  );
  if (openRegularSpaces.length === 0) {
    return;
  }

  // One query for the grants, one for the groups, one for their memberships.
  const referencesBySpaceModelId =
    await SpaceResource.listGrantReferencesBySpaceModelId(openRegularSpaces);
  // Only the `reader` grants: the global group holds one on every open space, so the group kind
  // filter below is what narrows this down to the space's own auto group.
  const readerGroupModelIds = [
    ...new Set(
      [...referencesBySpaceModelId.values()].flatMap((references) =>
        references
          .filter((ref) => ref.grantType === "reader")
          .map((ref) => ref.groupId)
      )
    ),
  ];
  const readerAutoGroups = await GroupResource.dangerouslyFetchByModelIds(
    auth,
    readerGroupModelIds,
    { groupKinds: ["regular_auto"] }
  );
  if (readerAutoGroups.length === 0) {
    return;
  }

  const userModelIdsByGroupModelId =
    await GroupResource.getActiveMembershipsForGroups(auth, readerAutoGroups);
  const nonEmptyGroups = readerAutoGroups.filter(
    (group) => (userModelIdsByGroupModelId[group.id] ?? []).length > 0
  );
  if (nonEmptyGroups.length === 0) {
    return;
  }

  const spaceByGroupModelId = new Map(
    openRegularSpaces.flatMap((space) =>
      (referencesBySpaceModelId.get(space.id) ?? []).map(
        (ref) => [ref.groupId, space] as const
      )
    )
  );

  // Resolved for the log only. Workspace membership is deliberately not a precondition: a group
  // membership outlives the workspace membership it came with, and those rows are worth clearing
  // too.
  const allUserModelIds = [
    ...new Set(
      nonEmptyGroups.flatMap((group) => userModelIdsByGroupModelId[group.id])
    ),
  ];
  const users = await UserResource.fetchByModelIds(allUserModelIds);
  const usersByModelId = new Map(users.map((user) => [user.id, user]));

  logger.info(
    {
      workspaceId: workspace.sId,
      execute,
      openRegularSpaces: openRegularSpaces.length,
      readerAutoGroups: readerAutoGroups.length,
      nonEmptyGroups: nonEmptyGroups.length,
      groupMembers: allUserModelIds.length,
    },
    "Open regular spaces with members behind a regular_auto reader grant"
  );

  for (const group of nonEmptyGroups) {
    const space = spaceByGroupModelId.get(group.id);
    logger.info(
      {
        workspaceId: workspace.sId,
        spaceId: space?.sId,
        spaceName: space?.name,
        groupId: group.sId,
        userIds: removeNulls(
          userModelIdsByGroupModelId[group.id].map(
            (id) => usersByModelId.get(id)?.sId ?? null
          )
        ),
      },
      execute
        ? "Removing members of an open space"
        : "Dry run: would remove members of an open space"
    );
  }

  if (!execute) {
    return;
  }

  // `GroupResource.dangerouslyRemoveMembers` refuses the whole batch as soon as one user has left
  // the workspace, so the rows are ended here the same way it ends them — one update for every
  // selected group of the workspace — followed by the per-user group cache invalidation it would
  // have done.
  const now = new Date();
  await GroupMembershipModel.update(
    { endAt: now },
    {
      where: {
        groupId: nonEmptyGroups.map((group) => group.id),
        userId: allUserModelIds,
        workspaceId: workspace.id,
        status: "active",
        startAt: { [Op.lte]: now },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
      },
    }
  );
  for (const userModelId of allUserModelIds) {
    await GroupResource.invalidateGroupIdsCacheForUser({
      user: { id: userModelId },
      workspace: { id: workspace.id },
    });
  }
}

// Guarded so the test can import `removeWorkspaceStaleOpenSpaceMembers` without running the CLI.
if (
  process.argv[1]?.endsWith(
    "20260917_remove_open_space_reader_auto_group_members.ts"
  )
) {
  makeScript(
    {
      wId: { type: "string", required: false },
    },
    async ({ wId, execute }, logger) => {
      logger.info("Starting open space reader auto group member removal");

      await runOnAllWorkspaces(
        async (workspace) => {
          await removeWorkspaceStaleOpenSpaceMembers(
            execute,
            logger,
            workspace
          );
        },
        { concurrency: 8, wId }
      );

      logger.info("Open space reader auto group member removal completed");
    }
  );
}
