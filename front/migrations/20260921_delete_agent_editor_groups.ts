import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import { Op, QueryTypes } from "sequelize";

const DEFAULT_BATCH_SIZE = 1_000;
const WORKSPACE_CONCURRENCY = 4;

const GroupModelBypass: ModelStaticWorkspaceAware<GroupModel> = GroupModel;

// Batched equivalent of the API-key cleanup in `GroupResource.delete`.
const REMOVE_GROUPS_FROM_KEYS_SQL = `
  UPDATE keys
  SET "groupIds" = ARRAY(
    SELECT "groupId"
    FROM unnest("groupIds") AS "groupId"
    WHERE "groupId" <> ALL(ARRAY[:groupModelIds]::bigint[])
  )
  WHERE "workspaceId" = :workspaceId
    AND "groupIds" && ARRAY[:groupModelIds]::bigint[]
`;

type MigrationWorkspace = Pick<LightWorkspaceType, "id" | "sId">;

export type AgentEditorGroupDeletionStats = {
  groups: number;
  memberships: number;
  agentLinks: number;
  permissions: number;
  keyReferences: number;
  deletedGroups: number;
  batches: number;
};

type ReferenceCounts = Omit<
  AgentEditorGroupDeletionStats,
  "groups" | "deletedGroups" | "batches"
>;

async function countReferences(
  workspace: MigrationWorkspace,
  groupModelIds: ModelId[]
): Promise<ReferenceCounts> {
  if (groupModelIds.length === 0) {
    return {
      memberships: 0,
      agentLinks: 0,
      permissions: 0,
      keyReferences: 0,
    };
  }

  // Keep these sequential: migrations already process several workspaces concurrently, and a
  // focused batch should not spend four database connections just to count its references.
  const memberships = await GroupMembershipModel.count({
    where: { workspaceId: workspace.id, groupId: groupModelIds },
  });
  const agentLinks = await GroupAgentModel.count({
    where: { workspaceId: workspace.id, groupId: groupModelIds },
  });
  const permissions = await GroupPermissionModel.count({
    where: { workspaceId: workspace.id, groupId: groupModelIds },
  });
  const keyReferences = await KeyModel.count({
    where: {
      workspaceId: workspace.id,
      groupIds: { [Op.overlap]: groupModelIds },
    },
  });

  return { memberships, agentLinks, permissions, keyReferences };
}

async function deleteGroupBatch(
  workspace: MigrationWorkspace,
  groupModelIds: ModelId[]
): Promise<number> {
  return withTransaction(async (transaction) => {
    const memberships = await GroupMembershipModel.findAll({
      where: { workspaceId: workspace.id, groupId: groupModelIds },
      attributes: ["userId"],
      transaction,
    });

    await frontSequelize.query(REMOVE_GROUPS_FROM_KEYS_SQL, {
      replacements: { workspaceId: workspace.id, groupModelIds },
      type: QueryTypes.UPDATE,
      transaction,
    });
    await GroupAgentModel.destroy({
      where: { workspaceId: workspace.id, groupId: groupModelIds },
      transaction,
    });
    await GroupMembershipModel.destroy({
      where: { workspaceId: workspace.id, groupId: groupModelIds },
      transaction,
    });
    await GroupPermissionModel.destroy({
      where: { workspaceId: workspace.id, groupId: groupModelIds },
      transaction,
    });
    const deletedGroups = await GroupModel.destroy({
      where: {
        id: groupModelIds,
        workspaceId: workspace.id,
        kind: "agent_editors",
      },
      transaction,
    });

    const memberUserModelIds = [
      ...new Set(memberships.map(({ userId }) => userId)),
    ];
    invalidateCacheAfterCommit(transaction, async () => {
      if (memberUserModelIds.length > 0) {
        await GroupResource.batchInvalidateGroupIdsCacheForUsers(
          memberUserModelIds.map((userModelId) => [
            {
              user: { id: userModelId },
              workspace: { id: workspace.id },
            },
          ])
        );
      }
      await GroupResource.invalidateWorkspaceGroupsFromSystemKeyCache(
        workspace.id
      );
    });

    return deletedGroups;
  });
}

async function fetchAgentEditorGroupWorkspaceModelIds(): Promise<ModelId[]> {
  // WORKSPACE_ISOLATION_BYPASS: This grouped query only discovers the workspaces that contain
  // legacy groups so the migration can avoid scanning every workspace.
  const rows = await GroupModelBypass.findAll({
    attributes: ["workspaceId"],
    where: { kind: "agent_editors" },
    group: ["workspaceId"],
    raw: true,
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  return rows.map(({ workspaceId }) => workspaceId);
}

/**
 * Deletes the legacy agent-editor groups of one workspace and every reference owned by them.
 * Dry-run is the default CLI behavior; repeated execute runs are no-ops.
 */
export async function deleteWorkspaceAgentEditorGroups({
  execute,
  logger,
  workspace,
  batchSize = DEFAULT_BATCH_SIZE,
}: {
  execute: boolean;
  logger: Logger;
  workspace: MigrationWorkspace;
  batchSize?: number;
}): Promise<AgentEditorGroupDeletionStats> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batchSize must be a positive integer");
  }

  const stats: AgentEditorGroupDeletionStats = {
    groups: 0,
    memberships: 0,
    agentLinks: 0,
    permissions: 0,
    keyReferences: 0,
    deletedGroups: 0,
    batches: 0,
  };
  let afterGroupModelId = 0;

  while (true) {
    const groups = await GroupModel.findAll({
      attributes: ["id"],
      where: {
        workspaceId: workspace.id,
        kind: "agent_editors",
        id: { [Op.gt]: afterGroupModelId },
      },
      order: [["id", "ASC"]],
      limit: batchSize,
    });
    if (groups.length === 0) {
      break;
    }

    const groupModelIds = groups.map(({ id }) => id);
    afterGroupModelId = groupModelIds[groupModelIds.length - 1];
    stats.groups += groupModelIds.length;
    stats.batches += 1;

    const references = await countReferences(workspace, groupModelIds);
    stats.memberships += references.memberships;
    stats.agentLinks += references.agentLinks;
    stats.permissions += references.permissions;
    stats.keyReferences += references.keyReferences;

    if (!execute) {
      continue;
    }

    stats.deletedGroups += await deleteGroupBatch(workspace, groupModelIds);

    const remainingReferences = await countReferences(workspace, groupModelIds);
    if (Object.values(remainingReferences).some((count) => count > 0)) {
      throw new Error(
        `Workspace ${workspace.sId} still has references to deleted agent-editor groups: ${JSON.stringify(
          remainingReferences
        )}.`
      );
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        batch: stats.batches,
        groupCount: groupModelIds.length,
        totalDeletedGroups: stats.deletedGroups,
      },
      "Deleted legacy agent-editor group batch"
    );
  }

  if (execute) {
    const remainingGroups = await GroupModel.count({
      where: { workspaceId: workspace.id, kind: "agent_editors" },
    });
    if (remainingGroups > 0) {
      throw new Error(
        `Workspace ${workspace.sId} still has ${remainingGroups} agent-editor groups.`
      );
    }
  }

  logger.info(
    { workspaceId: workspace.sId, execute, ...stats },
    "Legacy agent-editor group deletion completed for workspace"
  );
  return stats;
}

if (process.argv[1]?.endsWith("20260921_delete_agent_editor_groups.ts")) {
  makeScript(
    {
      wId: { type: "string", required: false },
      fromWorkspace: {
        type: "number",
        required: false,
        description: "Resume from this numeric workspace model ID",
      },
      batchSize: {
        type: "number",
        default: DEFAULT_BATCH_SIZE,
        description: "Maximum number of groups deleted per transaction",
      },
    },
    async ({ execute, wId, fromWorkspace, batchSize }, logger) => {
      const where = wId
        ? undefined
        : {
            id: {
              [Op.in]: await fetchAgentEditorGroupWorkspaceModelIds(),
            },
          };

      await runOnAllWorkspaces(
        async (workspace) => {
          await deleteWorkspaceAgentEditorGroups({
            execute,
            logger,
            workspace,
            batchSize,
          });
        },
        {
          concurrency: WORKSPACE_CONCURRENCY,
          wId,
          fromWorkspaceId: fromWorkspace,
          where,
        }
      );
    }
  );
}
