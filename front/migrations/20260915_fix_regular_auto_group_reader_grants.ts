import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

// A regular space's own `regular_auto` group (its manual member group) must hold a `member` grant
// on the space, whether the space is open or restricted: that grant is what lets its members — and
// API keys scoped to the space — write to it (see `SpaceResource.spaceGroupRoles`). Some open
// regular spaces ended up with that group holding a `reader` grant instead, which makes the space's
// member list meaningless and blocks writes.
//
// The affected spaces are detected with a direct query, but repaired through
// `SpaceResource.writeGroupPermissions`, which re-derives every grant of the space from its current
// group set (`member` for the auto group, `reader` for the workspace global group) and invalidates
// the per-group grants cache; a raw `group_permissions` update would leave the stale `reader` grant
// served from Redis.
//
// Idempotent: a space whose auto group already holds `member` is not touched.
async function fixWorkspaceRegularAutoGroupGrants(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const [regularSpaces, regularAutoGroups] = await Promise.all([
    SpaceModel.findAll({
      attributes: ["id"],
      where: { workspaceId: workspace.id, kind: "regular" },
    }),
    GroupModel.findAll({
      attributes: ["id"],
      where: { workspaceId: workspace.id, kind: "regular_auto" },
    }),
  ]);
  if (regularSpaces.length === 0 || regularAutoGroups.length === 0) {
    return;
  }

  const readerGrants = await GroupPermissionModel.findAll({
    attributes: ["groupId", "resourceId"],
    where: {
      workspaceId: workspace.id,
      resourceType: "space",
      resourceId: { [Op.in]: regularSpaces.map((space) => space.id) },
      groupId: { [Op.in]: regularAutoGroups.map((group) => group.id) },
      grantType: "reader",
    },
  });
  if (readerGrants.length === 0) {
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const spaces = await SpaceResource.fetchByModelIds(auth, [
    ...new Set(readerGrants.map((grant) => grant.resourceId)),
  ]);

  for (const space of spaces) {
    const context = {
      workspaceId: workspace.sId,
      spaceId: space.sId,
      spaceName: space.name,
      groupIds: readerGrants
        .filter((grant) => grant.resourceId === space.id)
        .map((grant) => grant.groupId),
    };

    if (!execute) {
      logger.info(
        context,
        "Dry run: would rewrite the space grants (regular_auto reader -> member)"
      );
      continue;
    }

    try {
      // Regular spaces have no editors; every attached group (auto group, provisioned groups, the
      // workspace global group when open) is a member and `spaceGroupRoles` picks its grant.
      const groups = await space.fetchGroupResources(auth);
      await space.writeGroupPermissions(auth, { members: groups, editors: [] });
      logger.info(context, "Rewrote the space grants");
    } catch (err) {
      logger.error(
        { ...context, error: normalizeError(err).message },
        "Failed to rewrite the space grants"
      );
    }
  }
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting regular_auto group reader grant fix");

    await runOnAllWorkspaces(
      async (workspace) => {
        await fixWorkspaceRegularAutoGroupGrants(execute, logger, workspace);
      },
      { concurrency: 4, wId }
    );

    logger.info("Regular_auto group reader grant fix completed");
  }
);
