import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

// A regular space's own `regular_auto` group (its manual member group) must hold a `member` grant
// on the space, whether the space is open or restricted: that grant is what lets its members — and
// API keys scoped to the space — write to it (see `SpaceResource.spaceGroupRoles`). Some open
// regular spaces ended up with that group holding a `reader` grant instead, which makes the space's
// member list meaningless and blocks writes. This flips those grants to `member`.
//
// Idempotent: only `reader` grants of `regular_auto` groups on `regular` spaces are touched.
async function fixWorkspaceRegularAutoGroupGrants(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const [regularSpaces, regularAutoGroups] = await Promise.all([
    SpaceModel.findAll({
      attributes: ["id", "name"],
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

  const spaceNameById = new Map(
    regularSpaces.map((space) => [space.id, space.name])
  );
  const context = {
    workspaceId: workspace.sId,
    grants: readerGrants.map((grant) => ({
      groupId: grant.groupId,
      spaceId: grant.resourceId,
      spaceName: spaceNameById.get(grant.resourceId),
    })),
  };

  if (!execute) {
    logger.info(
      context,
      "Dry run: would set regular_auto group grants from reader to member"
    );
    return;
  }

  const [updated] = await GroupPermissionModel.update(
    { grantType: "member" },
    {
      where: {
        workspaceId: workspace.id,
        id: { [Op.in]: readerGrants.map((grant) => grant.id) },
      },
    }
  );
  logger.info(
    { ...context, updated },
    "Set regular_auto group grants from reader to member"
  );
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
