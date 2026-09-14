import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { isString } from "@app/types/shared/utils/general";
import assert from "assert";
import type { Transaction } from "sequelize";
import { col, fn, Op, QueryTypes } from "sequelize";

const BATCH_SIZE = 100;
const CONCURRENCY = 4;
const TIMESTAMP_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';

type EditorGroup = {
  groupModelId: ModelId;
  agentModelId: ModelId;
  workspaceId: string;
};
type MembershipToCopy = Pick<GroupMembershipModel, "id" | "userId"> & {
  active: boolean;
};
type MembershipHistory = MembershipToCopy & { groupId: ModelId; key: string };
type Counts = { ended: number; active: number };

/**
 * @cc [owner:philipperolet,label:migration] latest-editor-groups
 * Only groups linked to an agent's latest non-draft configuration are eligible.
 */
async function fetchEditorGroups(afterGroupId: ModelId, wId?: string) {
  // Walk group IDs, not workspaces. Membership probes use (workspaceId, groupId, status, startAt).
  // Each editor group belongs to one agent; (agentId, version) supports the latest-version check.
  // Workspace history uses (workspaceId, userId, startAt, endAt), scoped to each editor.
  return frontSequelize.query<EditorGroup>(
    `SELECT DISTINCT g.id AS "groupModelId", c."agentId" AS "agentModelId", w."sId" AS "workspaceId"
     FROM groups g
     JOIN workspaces w ON w.id = g."workspaceId"
     JOIN group_agents ga ON ga."groupId" = g.id AND ga."workspaceId" = g."workspaceId"
     JOIN agent_configurations c ON c.id = ga."agentConfigurationId"
       AND c."workspaceId" = ga."workspaceId"
     WHERE g.kind = 'agent_editors' AND g.id > :afterGroupId
       AND (:wId IS NULL OR w."sId" = :wId)
       AND c.status <> 'draft'
       AND EXISTS (
         SELECT 1 FROM group_memberships m
         WHERE m."workspaceId" = g."workspaceId" AND m."groupId" = g.id
           AND m.status = 'active' AND m."startAt" <= NOW()
           AND (m."endAt" <= NOW() OR EXISTS (
             SELECT 1 FROM memberships wm
             WHERE wm."workspaceId" = m."workspaceId" AND wm."userId" = m."userId"
               AND wm."endAt" <= NOW()
           ))
       )
       -- Versions share their editor group; retain only the latest non-draft link.
       AND NOT EXISTS (
         SELECT 1 FROM agent_configurations newer
         WHERE newer."agentId" = c."agentId" AND newer."workspaceId" = c."workspaceId"
           AND newer.status <> 'draft' AND newer.version > c.version
       )
     ORDER BY g.id LIMIT :limit`,
    {
      replacements: { afterGroupId, wId: wId ?? null, limit: BATCH_SIZE },
      type: QueryTypes.SELECT,
    }
  );
}

/**
 * @cc [owner:philipperolet,label:migration] exact-history-keys
 * Distinct ended timestamps for a user MUST have distinct keys, even within one millisecond.
 */
async function fetchGroupHistory(
  workspaceId: ModelId,
  groupIds: ModelId[],
  now: Date,
  transaction: Transaction
): Promise<MembershipHistory[]> {
  // UTC strings with six fractional digits preserve precision for comparison and deduplication.
  const endAtText = fn(
    "to_char",
    fn("timezone", "UTC", col("endAt")),
    TIMESTAMP_FORMAT
  );
  // Both groups use the (workspaceId, groupId, status, startAt) index.
  const memberships = await GroupMembershipModel.findAll({
    attributes: ["id", "groupId", "userId", [endAtText, "endAtText"]],
    where: {
      workspaceId,
      groupId: groupIds,
      status: "active",
      startAt: { [Op.lte]: now },
    },
    // When source rows share a key, preserve the earliest start time.
    order: [["startAt", "ASC"]],
    transaction,
  });
  const nowText = now.toISOString().replace("Z", "000Z");
  return memberships.map((membership) => {
    const endAt = membership.get("endAtText");
    assert(endAt === null || isString(endAt));
    const active = endAt === null || endAt > nowText;
    return {
      id: membership.id,
      userId: membership.userId,
      groupId: membership.groupId,
      active,
      // Current rows share one key per user, even if their future end times differ.
      key: `${membership.userId}:${active ? "active" : endAt}`,
    };
  });
}

async function fetchPastWorkspaceUsers(
  workspaceId: ModelId,
  userIds: ModelId[],
  now: Date,
  transaction: Transaction
): Promise<Set<ModelId>> {
  // Source-group users only; uses (workspaceId, userId, startAt, endAt).
  const memberships = await MembershipModel.findAll({
    attributes: ["userId"],
    where: {
      workspaceId,
      userId: userIds,
      startAt: { [Op.lte]: now },
      endAt: { [Op.lte]: now },
    },
    transaction,
  });
  return new Set(memberships.map((membership) => membership.userId));
}

function selectMissingMemberships(
  source: MembershipHistory[],
  target: MembershipHistory[],
  eligibleUserIds: Set<ModelId>
): MembershipToCopy[] {
  // Match history by user/end time; any current target row covers current access.
  const existingKeys = new Set(target.map((membership) => membership.key));
  const missing: MembershipToCopy[] = [];
  for (const membership of source) {
    // Preserve current rows for revoked users too; Authenticator still requires workspace membership.
    if (membership.active && !eligibleUserIds.has(membership.userId)) {
      continue;
    }
    if (existingKeys.has(membership.key)) {
      continue;
    }
    existingKeys.add(membership.key);
    missing.push({
      id: membership.id,
      userId: membership.userId,
      active: membership.active,
    });
  }
  return missing;
}

async function fetchMissingMemberships(
  auth: Authenticator,
  sourceGroupModelId: ModelId,
  targetGroupModelId: ModelId | null,
  { rebuild, transaction }: { rebuild: boolean; transaction: Transaction }
): Promise<MembershipToCopy[]> {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const now = new Date();
  const groupIds =
    targetGroupModelId === null
      ? [sourceGroupModelId]
      : [sourceGroupModelId, targetGroupModelId];
  const memberships = await fetchGroupHistory(
    workspaceId,
    groupIds,
    now,
    transaction
  );
  const source = memberships.filter(
    (membership) => membership.groupId === sourceGroupModelId
  );
  const target = memberships.filter(
    (membership) => membership.groupId === targetGroupModelId
  );
  // Workspace revocation can leave editor-group memberships unended.
  const eligibleUserIds = await fetchPastWorkspaceUsers(
    workspaceId,
    [...new Set(source.map((membership) => membership.userId))],
    now,
    transaction
  );
  // Group history also qualifies users. Orphan rebuilds need all legacy editors.
  for (const membership of source) {
    if (rebuild || !membership.active) {
      eligibleUserIds.add(membership.userId);
    }
  }
  return selectMissingMemberships(source, target, eligibleUserIds);
}

/**
 * @cc [owner:philipperolet,label:security] delete-confirmed-orphans-only
 * Only the exact-name regular_auto group with no grants may be deleted for a rebuild.
 */
async function removeOrphanGroup(
  auth: Authenticator,
  agentModelId: ModelId,
  {
    execute,
    transaction,
    logger,
  }: { execute: boolean; transaction: Transaction; logger: Logger }
): Promise<boolean> {
  const workspaceId = auth.getNonNullableWorkspace().id;
  // The unique (workspaceId, name) index bounds this lookup. Lock against new grant FK references.
  const model = await GroupModel.findOne({
    where: {
      workspaceId,
      name: `Group for permission editor on agent (${agentModelId})`,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!model) {
    return false;
  }
  assert(model.kind === "regular_auto", "Colliding group is not regular_auto.");
  const orphan = new GroupResource(GroupModel, model.get());
  const grants = await GroupPermissionResource.listForGroup(
    auth,
    orphan,
    transaction
  );
  assert(grants.length === 0, "Colliding group still has grants.");
  logger.info(
    {
      execute,
      workspaceId: auth.getNonNullableWorkspace().sId,
      agentModelId,
      orphanGroupModelId: orphan.id,
    },
    "Rebuilding orphaned agent editor group from legacy memberships"
  );
  if (execute) {
    const deleted = await orphan.delete(auth, { transaction });
    if (deleted.isErr()) {
      throw deleted.error;
    }
  }
  return true;
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
 * Current group memberships MUST come from current legacy memberships, including revoked users.
 * Limit this to users with ended group or workspace memberships unless rebuilding an orphan.
 * Copied rows MUST NOT grant permissions while the user's workspace membership is revoked.
 */
/**
 * @cc [owner:philipperolet,label:migration] atomic-orphan-rebuild
 * Orphan deletion and rebuilding its grant and memberships MUST commit or roll back together.
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
  execute: boolean,
  logger: Logger
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
    const rebuild =
      !group &&
      (await removeOrphanGroup(auth, source.agentModelId, {
        execute,
        transaction,
        logger,
      }));
    const missing = await fetchMissingMemberships(
      auth,
      source.groupModelId,
      group?.id ?? null,
      { rebuild, transaction }
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

async function repairBatch(
  editors: EditorGroup[],
  execute: boolean,
  logger: Logger
) {
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
      const counts = await repairEditorGroup(auth, editor, execute, logger);
      logger.info(
        { execute, ...editor, ...counts },
        "Agent editor memberships checked"
      );
      return counts;
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
    const editors = await fetchEditorGroups(cursor, wId);
    if (editors.length === 0) {
      return totals;
    }
    const counts = await repairBatch(editors, execute, logger);
    for (const count of counts) {
      totals.ended += count.ended;
      totals.active += count.active;
    }
    cursor = editors[editors.length - 1].groupModelId;
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
