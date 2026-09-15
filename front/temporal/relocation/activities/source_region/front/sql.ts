// biome-ignore-all lint/plugin/noRawSql: relocation SQL file requires raw SQL

import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  UserMetadataModel,
  UserModel,
} from "@app/lib/resources/storage/models/user";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type {
  CoreEntitiesRelocationBlob,
  ReadTableChunkParams,
  RelocationBlob,
} from "@app/temporal/relocation/activities/types";
import {
  withJSONSerializationRetry,
  writeToRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import { generateParameterizedInsertStatements } from "@app/temporal/relocation/lib/sql/insert";
import { getTopologicalOrder } from "@app/temporal/relocation/lib/sql/schema/dependencies";
import { getWorkspaceReferencedUserIds } from "@app/temporal/relocation/lib/sql/schema/introspection";
import type { CellType } from "@app/types/cell";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";
import { Op, QueryTypes } from "sequelize";

export async function readCoreEntitiesFromSourceRegion({
  destCell,
  sourceCell,
  workspaceId,
}: {
  destCell: CellType;
  sourceCell: CellType;
  workspaceId: string;
}) {
  const localLogger = logger.child({
    destCell,
    sourceCell,
    workspaceId,
  });

  localLogger.info("[SQL Core Entities] Reading core entities.");

  // Find the raw workspace.
  const workspace = await WorkspaceModel.findOne({
    where: {
      sId: workspaceId,
    },
    raw: true,
  });
  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  // Fetch members of the workspace.
  const { memberships } = await MembershipResource.getMembershipsForWorkspace({
    workspace: renderLightWorkspaceType({ workspace }),
  });

  // Every user the workspace's rows point at, members included. The destination maps
  // each of them to its own user by workOSUserId, or creates them, so no foreign key
  // is left dangling by a reference to someone who is not a member.
  const memberUserIds = memberships.map((m) => m.userId);
  const referencedUserIds = await getWorkspaceReferencedUserIds(
    frontSequelize,
    {
      workspaceId: workspace.id,
    }
  );
  const userIds = [...new Set([...memberUserIds, ...referencedUserIds])];
  localLogger.info(
    {
      memberCount: memberUserIds.length,
      referencedOnlyCount: userIds.length - memberUserIds.length,
    },
    "[SQL Core Entities] Users to relocate."
  );
  const users = await UserModel.findAll({
    where: {
      id: {
        [Op.in]: userIds,
      },
    },
    // We need the raw SQL.
    raw: true,
  });

  // Fetch all associated users metadata of the workspace.
  // Only fetch metadata where workspaceId is null (global) or matches the workspace being
  // relocated. This avoids FK violations when inserting into destination cell for metadata
  // referencing other workspaces.
  const userMetadata = await UserMetadataModel.findAll({
    where: {
      userId: {
        [Op.in]: memberships.map((m) => m.userId),
      },
      workspaceId: {
        [Op.or]: [{ [Op.is]: null }, { [Op.eq]: workspace.id }],
      },
    },
    raw: true,
  });

  const subscriptions = await frontSequelize.query<{ planId: ModelId }>(
    'SELECT * FROM subscriptions WHERE "workspaceId" = :workspaceId',
    {
      replacements: { workspaceId: workspace.id },
      type: QueryTypes.SELECT,
      raw: true,
    }
  );

  const plans = await frontSequelize.query(
    "SELECT * FROM plans WHERE id IN (:ids)",
    {
      replacements: { ids: subscriptions.map((s) => s.planId) },
      type: QueryTypes.SELECT,
      raw: true,
    }
  );

  const blob: CoreEntitiesRelocationBlob = {
    statements: {
      plans: generateParameterizedInsertStatements("plans", plans, {
        onConflict: "ignore",
      }),
      users: generateParameterizedInsertStatements("users", users, {
        onConflict: "ignore",
      }),
      user_metadata: generateParameterizedInsertStatements(
        "user_metadata",
        userMetadata,
        {
          onConflict: "ignore",
        }
      ),
      workspace: generateParameterizedInsertStatements(
        "workspaces",
        [workspace],
        {
          onConflict: "ignore",
        }
      ),
    },
  };

  // We store the data in a storage.
  const dataPath = await writeToRelocationStorage(blob, {
    workspaceId,
    type: "front",
    operation: "read_workspace_and_users",
  });

  localLogger.info(
    {
      dataPath,
    },
    "[SQL Core Entities] Core entities read successfully."
  );

  // Return the path (not the data) to preserve activity return size.
  return dataPath;
}

export async function getTablesWithWorkspaceIdOrder() {
  return getTopologicalOrder(frontSequelize, {
    columnName: "workspaceId",
  });
}

export async function readFrontTableChunk({
  destCell,
  lastId,
  limit,
  sourceCell,
  tableName,
  workspaceId,
  fileName,
}: ReadTableChunkParams) {
  const localLogger = logger.child({
    destCell,
    lastId,
    sourceCell,
    tableName,
    workspaceId,
    fileName,
  });

  localLogger.info("[SQL Table] Reading table chunk");

  let realLimit = limit;
  if (tableName === "agent_mcp_action_output_items" && limit > 100) {
    realLimit = 100;
  }

  const workspace = await getWorkspaceInfos(workspaceId);
  assert(workspace, "Workspace not found");

  const idClause = lastId ? `AND id > ${lastId}` : "";

  const rows = await frontSequelize.query<Record<string, any>>(
    `SELECT * FROM "${tableName}"
     WHERE "workspaceId" = :workspaceId ${idClause}
     ORDER BY id
     LIMIT :limit`,
    {
      replacements: { workspaceId: workspace.id, limit: realLimit },
      type: QueryTypes.SELECT,
      raw: true,
    }
  );

  const blob: RelocationBlob = {
    statements: {
      [tableName]: generateParameterizedInsertStatements(tableName, rows, {
        onConflict: "ignore",
      }),
    },
  };

  return withJSONSerializationRetry<{
    dataPath: string | null;
    hasMore: boolean;
    lastId: number | undefined;
    nextLimit: number | null;
  }>(
    async () => {
      const dataPath = await writeToRelocationStorage(blob, {
        workspaceId,
        type: "front",
        operation: `read_table_chunk_${tableName}`,
        fileName,
      });

      localLogger.info(
        {
          dataPath,
        },
        "[SQL Table] Table chunk read successfully"
      );

      return {
        dataPath,
        hasMore: rows.length === realLimit,
        lastId: rows[rows.length - 1]?.id ?? lastId,
        nextLimit: null,
      };
    },
    {
      fallbackResult: {
        dataPath: null,
        hasMore: true,
        lastId,
      },
      limit: realLimit,
      localLogger,
    }
  );
}
