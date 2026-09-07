/*
import { Op, QueryTypes } from "sequelize";

import {
  GroupResource,
  MANUAL_BUILDERS_GROUP_NAME,
} from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { concurrentExecutor } from "@app/lib/utils/async_utils";

const WORKSPACE_CONCURRENCY = 8;
*/

/**
 * Backfill of the "Builders" group (builder role deprecation, PR 2 of
 * https://github.com/dust-tt/tasks/issues/9459).
 *
 * The sync shipped in PR 1 only fires on membership writes, so builders whose role never
 * changes after the deploy would never enter the group. This one-shot reconciles every
 * workspace from the roles (the source of truth): active builders are added to the group,
 * group members who are not active builders are removed.
 */

/*

async function reconcileWorkspace(
  workspaceModelId: number,
  execute: boolean,
  logger: Logger
): Promise<{ added: number; removed: number }> {
  const [workspace] = await WorkspaceResource.fetchByModelIds([
    workspaceModelId,
  ]);
  if (!workspace) {
    logger.warn({ workspaceModelId }, "Workspace not found, skipping");
    return { added: 0, removed: 0 };
  }
  const lightWorkspace = renderLightWorkspaceType({ workspace });

  const now = new Date();
  const activeWindow = {
    startAt: { [Op.lte]: now },
    [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
  };

  const builderMemberships = await MembershipModel.findAll({
    attributes: ["userId"],
    where: { workspaceId: workspaceModelId, role: "builder", ...activeWindow },
  });
  const builderUserIds = new Set(builderMemberships.map((m) => m.userId));

  const group = await GroupResource.fetchManualBuildersGroup(lightWorkspace);

  let currentMemberIds = new Set<number>();
  if (group) {
    const memberRows = await GroupMembershipModel.findAll({
      attributes: ["userId"],
      where: {
        groupId: group.id,
        workspaceId: workspaceModelId,
        status: "active",
        ...activeWindow,
      },
    });
    currentMemberIds = new Set(memberRows.map((r) => r.userId));
  }

  const toAdd = [...builderUserIds].filter((id) => !currentMemberIds.has(id));
  const toRemove = [...currentMemberIds].filter(
    (id) => !builderUserIds.has(id)
  );
  if (toAdd.length === 0 && toRemove.length === 0) {
    return { added: 0, removed: 0 };
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      toAdd: toAdd.length,
      toRemove: toRemove.length,
      execute,
    },
    execute
      ? "Reconciling Builders group"
      : "Would reconcile Builders group (dry run)"
  );
  if (!execute) {
    return { added: toAdd.length, removed: toRemove.length };
  }

  const users = await UserResource.fetchByModelIds([...toAdd, ...toRemove]);
  const userByModelId = new Map(users.map((u) => [u.id, u]));

  // Per-user sync inside the loop is a deliberate reuse of the PR 1 code path (idempotent,
  // race-safe): one-shot migration, a few queries per out-of-sync user only — and only
  // builders are synced, a small fraction of users.
  let added = 0;
  let removed = 0;
  for (const userModelId of toAdd) {
    const user = userByModelId.get(userModelId);
    if (!user) {
      logger.warn(
        { workspaceId: workspace.sId, userModelId },
        "User not found, skipping"
      );
      continue;
    }
    await GroupResource.syncBuilderGroupMembership({
      workspace: lightWorkspace,
      user,
      isBuilder: true,
    });
    added++;
  }
  for (const userModelId of toRemove) {
    const user = userByModelId.get(userModelId);
    if (!user) {
      logger.warn(
        { workspaceId: workspace.sId, userModelId },
        "User not found, skipping"
      );
      continue;
    }
    await GroupResource.syncBuilderGroupMembership({
      workspace: lightWorkspace,
      user,
      isBuilder: false,
    });
    removed++;
  }

  return { added, removed };
}

makeScript({}, async ({ execute }, logger) => {
  // One-shot full scans: workspaces with at least one active builder, plus workspaces
  // already holding a non-provisioned Builders group (to reconcile removals).
  const candidates = await frontSequelize.query<{ workspaceId: number }>(
    `SELECT DISTINCT "workspaceId" FROM memberships
     WHERE role = 'builder' AND "startAt" <= NOW()
       AND ("endAt" IS NULL OR "endAt" > NOW())
     UNION
     SELECT DISTINCT "workspaceId" FROM groups
     WHERE name = :groupName AND kind != 'provisioned'`,
    {
      type: QueryTypes.SELECT,
      replacements: { groupName: MANUAL_BUILDERS_GROUP_NAME },
    }
  );

  logger.info({ count: candidates.length }, "Found candidate workspaces");

  const results = await concurrentExecutor(
    candidates,
    (candidate) => reconcileWorkspace(candidate.workspaceId, execute, logger),
    { concurrency: WORKSPACE_CONCURRENCY }
  );

  const added = results.reduce((sum, r) => sum + r.added, 0);
  const removed = results.reduce((sum, r) => sum + r.removed, 0);
  const touchedWorkspaces = results.filter(
    (r) => r.added > 0 || r.removed > 0
  ).length;

  logger.info(
    { workspaces: touchedWorkspaces, added, removed, execute },
    execute
      ? "Builders group backfill complete"
      : "Builders group backfill dry run complete"
  );
});
*/
