import { frontSequelize } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { Op, QueryTypes } from "sequelize";

// Ends every membership left `suspended` by the former space management-mode switch (see
// `20251013_suspend_group_mode_members`): a space switching to group mode used to keep its manual
// members on record but inert, so the switch back to manual mode could restore them.
//
// Suspended memberships are already excluded from every active-membership query, so this grants
// and revokes nothing — no group-id cache invalidation is needed. What it does is move the
// "inert" state from `status` onto `endAt`, so that merging the two membership modes cannot
// resurrect a member list that an admin dropped by switching to group mode.
//
// Scoped to the space-owned groups only: the `regular_auto` groups holding a `space` grant, which
// are exactly the groups a management-mode switch could suspend. Agent-editor and skill-editor
// memberships were suspended by their own migrations and have their own restore backfills
// (`20260828_restore_agent_editor_memberships`, `20260828_restore_skill_editor_memberships`);
// ending them here would make them unrestorable.
//
// Run after deploying the change that ends (rather than suspends) memberships on a switch to
// group mode, so no new suspended row can appear behind the script.
//
// Idempotent: it only touches suspended memberships that are still open.
async function endSuspendedGroupMemberships(
  logger: Logger,
  { execute }: { execute: boolean }
) {
  const now = new Date();

  // The space member/editor groups holding a still-open suspended membership. Raw query because
  // it spans workspaces; bounded by the number of spaces that ever used group management mode.
  const rows = await frontSequelize.query<{
    workspaceId: ModelId;
    groupId: ModelId;
  }>(
    `SELECT DISTINCT gm."workspaceId", gm."groupId"
       FROM group_memberships gm
       JOIN groups g
         ON g.id = gm."groupId"
        AND g."workspaceId" = gm."workspaceId"
       JOIN group_permissions gp
         ON gp."groupId" = gm."groupId"
        AND gp."workspaceId" = gm."workspaceId"
        AND gp."resourceType" = 'space'
      WHERE gm.status = 'suspended'
        AND (gm."endAt" IS NULL OR gm."endAt" > :now)
        AND g.kind = 'regular_auto'`,
    {
      replacements: { now },
      type: QueryTypes.SELECT,
    }
  );

  // Grouped by workspace so every update below is workspace-scoped.
  const groupModelIdsByWorkspaceModelId = new Map<ModelId, ModelId[]>();
  for (const { workspaceId, groupId } of rows) {
    const groupModelIds = groupModelIdsByWorkspaceModelId.get(workspaceId);
    if (groupModelIds) {
      groupModelIds.push(groupId);
    } else {
      groupModelIdsByWorkspaceModelId.set(workspaceId, [groupId]);
    }
  }

  logger.info(
    {
      workspaces: groupModelIdsByWorkspaceModelId.size,
      groups: rows.length,
      execute,
    },
    "Ending suspended space memberships"
  );

  let totalEnded = 0;

  for (const [
    workspaceId,
    groupModelIds,
  ] of groupModelIdsByWorkspaceModelId.entries()) {
    const where = {
      workspaceId,
      groupId: { [Op.in]: groupModelIds },
      status: "suspended" as const,
      [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
    };

    if (!execute) {
      const count = await GroupMembershipModel.count({ where });
      logger.info(
        { workspaceId, groups: groupModelIds.length, memberships: count },
        "Dry run: would end suspended memberships"
      );
      totalEnded += count;
      continue;
    }

    const [ended] = await GroupMembershipModel.update(
      { endAt: new Date() },
      { where }
    );

    logger.info(
      { workspaceId, groups: groupModelIds.length, memberships: ended },
      "Ended memberships"
    );
    totalEnded += ended;
  }

  logger.info(
    {
      workspaces: groupModelIdsByWorkspaceModelId.size,
      memberships: totalEnded,
      execute,
    },
    "Suspended space memberships backfill done"
  );
}

makeScript({}, async ({ execute }, logger) => {
  await endSuspendedGroupMemberships(logger, { execute });
});
