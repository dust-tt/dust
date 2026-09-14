import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

// Backfill: re-activate the suspended memberships of the regular_auto groups holding a skill's
// `editor` grant.
//
// Archiving a skill used to suspend its editor memberships, which made archived skills look
// editor-less everywhere editors are read (`listEditors` / `batchListEditors` are active-only) and
// hid unpublished ones from their own editors. `archive` no longer suspends anything and `restore`
// no longer un-suspends anything, so those memberships have to be brought back.
//
// Scope is every skill `editor` grant group, not just the archived skills': nothing suspends these
// groups anymore, so any suspended membership left in one is stale. That also makes this script
// order-independent with the deploy — a skill restored between the two would otherwise keep
// suspended editors forever, since it is no longer archived for a status-scoped backfill to find.
//
// Idempotent: `restoreMembers` only touches memberships whose status is "suspended".

const WORKSPACE_CONCURRENCY = 8;

// The regular_auto groups holding a skill `editor` grant, restricted to those that still have a
// suspended membership to bring back. Two queries for the whole workspace, no per-group count.
//
// Read straight from the models: the skills involved may reference restricted or deleted spaces,
// which makes them unfetchable through `SkillResource`, and their editors need the backfill too.
async function listGroupsToRestore(
  auth: Authenticator,
  workspaceModelId: ModelId
): Promise<{
  groups: GroupResource[];
  suspendedCountByGroupId: Map<ModelId, number>;
}> {
  const empty = {
    groups: [],
    suspendedCountByGroupId: new Map<ModelId, number>(),
  };

  const grants = await GroupPermissionModel.findAll({
    attributes: ["groupId"],
    where: {
      workspaceId: workspaceModelId,
      grantType: "editor",
      resourceType: "skill",
    },
  });
  if (grants.length === 0) {
    return empty;
  }

  const now = new Date();
  const suspendedMemberships = await GroupMembershipModel.findAll({
    attributes: ["groupId", "userId"],
    where: {
      workspaceId: workspaceModelId,
      groupId: [...new Set(grants.map((grant) => grant.groupId))],
      status: "suspended",
      startAt: { [Op.lte]: now },
      [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
    },
  });
  if (suspendedMemberships.length === 0) {
    return empty;
  }

  const suspendedCountByGroupId = new Map<ModelId, number>();
  for (const membership of suspendedMemberships) {
    suspendedCountByGroupId.set(
      membership.groupId,
      (suspendedCountByGroupId.get(membership.groupId) ?? 0) + 1
    );
  }

  const groups = await GroupResource.dangerouslyFetchByModelIds(
    auth,
    [...suspendedCountByGroupId.keys()],
    { groupKinds: ["regular_auto"] }
  );

  return { groups, suspendedCountByGroupId };
}

async function restoreWorkspaceSkillEditors(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  // All groups: the skills involved may reference restricted spaces, which the default auth cannot
  // read.
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  const { groups, suspendedCountByGroupId } = await listGroupsToRestore(
    auth,
    workspaceModelId
  );
  if (groups.length === 0) {
    return;
  }

  let membershipsRestored = 0;

  for (const group of groups) {
    const suspendedCount = suspendedCountByGroupId.get(group.id) ?? 0;

    if (!execute) {
      membershipsRestored += suspendedCount;
      logger.info(
        {
          workspaceId: workspace.sId,
          groupId: group.id,
          editorCount: suspendedCount,
        },
        "Dry run: would restore the skill's suspended editor memberships"
      );
      continue;
    }

    const restoredUserIds = await group.dangerouslyRestoreMembers(auth);
    membershipsRestored += restoredUserIds.length;

    logger.info(
      {
        workspaceId: workspace.sId,
        groupId: group.id,
        editorCount: restoredUserIds.length,
      },
      "Restored the skill's suspended editor memberships"
    );
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      groups: groups.length,
      membershipsRestored,
    },
    "Completed skill editor membership restoration for workspace"
  );
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting skill editor membership restoration");

    await runOnAllWorkspaces(
      async (workspace) => {
        await restoreWorkspaceSkillEditors(execute, logger, workspace);
      },
      { concurrency: WORKSPACE_CONCURRENCY, wId }
    );

    logger.info("Skill editor membership restoration completed");
  }
);
