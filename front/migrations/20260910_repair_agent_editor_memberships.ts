import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";
import type { Transaction } from "sequelize";
import { QueryTypes } from "sequelize";

const BATCH_SIZE = 100;
const CONCURRENCY = 4;

type EditorGroup = {
  groupModelId: ModelId;
  agentModelId: ModelId;
  workspaceId: string;
};
type MembershipToCopy = Pick<GroupMembershipModel, "id" | "userId"> & {
  active: boolean;
};
type Counts = { ended: number; active: number };

async function fetchHistoryGroups(afterGroupId: ModelId, wId?: string) {
  // Walk group IDs, not workspaces. Membership probes use (workspaceId, groupId, status, startAt).
  return frontSequelize.query<{ id: ModelId }>(
    `SELECT g.id FROM groups g
     JOIN workspaces w ON w.id = g."workspaceId"
     WHERE g.kind = 'agent_editors' AND g.id > :afterGroupId
       AND (:wId IS NULL OR w."sId" = :wId)
       AND EXISTS (
         SELECT 1 FROM group_memberships m
         WHERE m."workspaceId" = g."workspaceId" AND m."groupId" = g.id
           AND m.status = 'active' AND m."endAt" <= NOW()
       )
     ORDER BY g.id LIMIT :limit`,
    {
      replacements: { afterGroupId, wId: wId ?? null, limit: BATCH_SIZE },
      type: QueryTypes.SELECT,
    }
  );
}

async function fetchEditorGroups(groupIds: ModelId[]) {
  // Resolve only this batch's links; (agentId, version) supports the latest-version check.
  return frontSequelize.query<EditorGroup>(
    `SELECT DISTINCT ga."groupId" AS "groupModelId", c."agentId" AS "agentModelId", w."sId" AS "workspaceId"
     FROM group_agents ga
     JOIN agent_configurations c ON c.id = ga."agentConfigurationId"
       AND c."workspaceId" = ga."workspaceId"
     JOIN workspaces w ON w.id = ga."workspaceId"
     WHERE ga."groupId" IN (:groupIds) AND c.status <> 'draft'
       AND NOT EXISTS (
         SELECT 1 FROM agent_configurations newer
         WHERE newer."agentId" = c."agentId" AND newer."workspaceId" = c."workspaceId"
           AND newer.status <> 'draft' AND newer.version > c.version
       )`,
    { replacements: { groupIds }, type: QueryTypes.SELECT }
  );
}

async function fetchMissingMemberships(
  auth: Authenticator,
  sourceGroupModelId: ModelId,
  targetGroupModelId: ModelId | null,
  transaction: Transaction
): Promise<MembershipToCopy[]> {
  // Only history-bearing users can contribute active rows; no workspace-wide editor comparison.
  return frontSequelize.query<MembershipToCopy>(
    `SELECT DISTINCT ON (m."userId", CASE WHEN m."endAt" <= :now THEN m."endAt" END)
       m.id, m."userId",
       (m."endAt" IS NULL OR m."endAt" > :now) AS active
     FROM group_memberships m
     WHERE m."workspaceId" = :workspaceId AND m."groupId" = :sourceGroupModelId
       AND m.status = 'active' AND m."startAt" <= :now
       AND (m."endAt" <= :now OR (
         EXISTS (SELECT 1 FROM group_memberships history
           WHERE history."workspaceId" = m."workspaceId" AND history."groupId" = m."groupId"
             AND history."userId" = m."userId" AND history.status = 'active'
             AND history."endAt" <= :now)
         AND EXISTS (SELECT 1 FROM memberships wm
           WHERE wm."workspaceId" = m."workspaceId" AND wm."userId" = m."userId"
             AND wm."startAt" <= :now AND (wm."endAt" IS NULL OR wm."endAt" > :now))
       ))
       AND NOT EXISTS (SELECT 1 FROM group_memberships target
         WHERE target."workspaceId" = m."workspaceId" AND target."groupId" = :targetGroupModelId
           AND target."userId" = m."userId" AND target.status = 'active'
           AND CASE WHEN m."endAt" <= :now THEN target."endAt" = m."endAt"
             ELSE target."startAt" <= :now AND (target."endAt" IS NULL OR target."endAt" > :now) END)
     ORDER BY m."userId", CASE WHEN m."endAt" <= :now THEN m."endAt" END, m."startAt"`,
    {
      replacements: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sourceGroupModelId,
        targetGroupModelId,
        now: new Date(),
      },
      type: QueryTypes.SELECT,
      transaction,
    }
  );
}

async function copyMemberships(
  auth: Authenticator,
  agentModelId: ModelId,
  group: GroupResource | null,
  memberships: MembershipToCopy[],
  transaction: Transaction
) {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const target =
    group ??
    (await GroupResource.makeNew(
      {
        workspaceId,
        kind: "regular_auto",
        name: `Group for permission editor on agent (${agentModelId})`,
      },
      { transaction }
    ));
  if (!group) {
    await GroupPermissionResource.grant(auth, {
      group: target,
      resourceType: "agent",
      resourceId: agentModelId,
      grantType: "editor",
      transaction,
    });
  }
  // Copy in SQL to preserve timestamp precision beyond JavaScript's milliseconds.
  await frontSequelize.query(
    `INSERT INTO group_memberships ("workspaceId", "groupId", "userId", "startAt", "endAt", status, "createdAt", "updatedAt")
     SELECT "workspaceId", :groupId, "userId", "startAt", "endAt", status, NOW(), NOW()
     FROM group_memberships WHERE "workspaceId" = :workspaceId AND id IN (:ids)`,
    {
      replacements: {
        workspaceId,
        groupId: target.id,
        ids: memberships.map(({ id }) => id),
      },
      transaction,
    }
  );
  const activeUsers = memberships.filter(({ active }) => active);
  if (activeUsers.length > 0) {
    invalidateCacheAfterCommit(transaction, async () => {
      await GroupResource.batchInvalidateGroupIdsCacheForUsers(
        activeUsers.map(({ userId }) => [
          {
            user: { id: userId },
            workspace: { id: workspaceId },
          },
        ])
      );
    });
  }
}

/**
 * @cc [owner:philipperolet,label:security] preserve-ended-memberships
 * Copied ended memberships MUST retain their start and end timestamps.
 */
/**
 * @cc [owner:philipperolet,label:security] repair-current-editors-only
 * Active grants MUST only be copied for history-bearing users who currently belong to both
 * the legacy editor group and the workspace.
 */
/**
 * @cc [owner:philipperolet,label:migration] editor-repair-dry-run
 * Dry runs MUST NOT write data.
 */
/**
 * @cc [owner:philipperolet,label:migration] idempotent-editor-repair
 * Reruns MUST NOT duplicate existing memberships.
 */
async function repairEditorGroup(
  auth: Authenticator,
  source: EditorGroup,
  execute: boolean
): Promise<Counts> {
  return withTransaction(async (transaction) => {
    // Same lock as GroupPermissionResource.getGrantLock, including live grant-group cleanup.
    const key = `group_permissions:${auth.getNonNullableWorkspace().id}:agent:${source.agentModelId}:editor`;
    await frontSequelize.query("SELECT pg_advisory_xact_lock(hashtext(:key))", {
      replacements: { key },
      transaction,
    });
    const group = await GroupPermissionResource.findRegularAutoGroupForGrant(
      auth,
      {
        resourceType: "agent",
        resourceId: source.agentModelId,
        grantType: "editor",
        transaction,
      }
    );
    const missing = await fetchMissingMemberships(
      auth,
      source.groupModelId,
      group?.id ?? null,
      transaction
    );
    const active = missing.filter((membership) => membership.active).length;
    if (execute && missing.length > 0) {
      await copyMemberships(
        auth,
        source.agentModelId,
        group,
        missing,
        transaction
      );
    }
    return { ended: missing.length - active, active };
  });
}

async function repairBatch(editors: EditorGroup[], execute: boolean) {
  const auths = new Map<string, Authenticator>();
  for (const workspaceId of new Set(
    editors.map((editor) => editor.workspaceId)
  )) {
    auths.set(
      workspaceId,
      await Authenticator.internalAdminForWorkspace(workspaceId)
    );
  }
  return concurrentExecutor(
    editors,
    async (editor) => {
      const auth = auths.get(editor.workspaceId);
      assert(auth);
      return repairEditorGroup(auth, editor, execute);
    },
    { concurrency: CONCURRENCY }
  );
}

export async function repairEditorMemberships({
  execute,
  logger,
  wId,
  afterGroupId = 0,
}: {
  execute: boolean;
  logger: Logger;
  wId?: string;
  afterGroupId?: ModelId;
}): Promise<Counts> {
  let cursor = afterGroupId;
  const totals = { ended: 0, active: 0 };
  for (;;) {
    const groups = await fetchHistoryGroups(cursor, wId);
    if (groups.length === 0) {
      return totals;
    }
    const editors = await fetchEditorGroups(groups.map(({ id }) => id));
    const counts = await repairBatch(editors, execute);
    for (const count of counts) {
      totals.ended += count.ended;
      totals.active += count.active;
    }
    cursor = groups[groups.length - 1].id;
    logger.info(
      { execute, afterGroupId: cursor, groups: editors.length, ...totals },
      "Agent editor repair batch completed"
    );
  }
}

if (process.argv[1]?.endsWith("20260910_repair_agent_editor_memberships.ts")) {
  makeScript(
    {
      wId: { type: "string", description: "Restrict to one workspace" },
      afterGroupId: {
        type: "number",
        default: 0,
        description: "Resume after a completed batch's group ID",
      },
    },
    async ({ execute, wId, afterGroupId }, logger) => {
      await repairEditorMemberships({ execute, logger, wId, afterGroupId });
    }
  );
}
