import type { ModelId } from "@dust-tt/types";
import assert from "assert";
import { Op, QueryTypes } from "sequelize";

import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { Workspace } from "@app/lib/models/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type {
  CoreEntitiesRelocationBlob,
  RelocationBlob,
} from "@app/temporal/relocation/activities/types";
import { writeToRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";
import { generateInsertStatements } from "@app/temporal/relocation/lib/sql/insert";
import { getTopologicalOrder } from "@app/temporal/relocation/lib/sql/schema/dependencies";

export async function readCoreEntitiesFromSourceRegion({
  workspaceId,
}: {
  workspaceId: string;
}) {
  // Find the raw workspace.
  const workspace = await Workspace.findOne({
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

  // Fetch all associated users of the workspace.
  const users = await UserModel.findAll({
    where: {
      id: {
        [Op.in]: memberships.map((m) => m.userId),
      },
    },
    // We need the raw SQL.
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
      plans: generateInsertStatements("plans", plans, { onConflict: "ignore" }),
      users: generateInsertStatements("users", users, { onConflict: "ignore" }),
      workspace: generateInsertStatements("workspaces", [workspace], {
        onConflict: "ignore",
      }),
    },
  };

  // We store the data in a storage.
  const dataPath = await writeToRelocationStorage(blob, {
    workspaceId,
    type: "front",
    operation: "read_workspace_and_users",
  });

  // Return the path (not the data) to preserve activity return size.
  return dataPath;
}

export async function getTablesWithWorkspaceIdOrder() {
  return getTopologicalOrder(frontSequelize, {
    columnName: "workspaceId",
  });
}

interface ReadTableChunkParams {
  lastId?: ModelId;
  limit: number;
  tableName: string;
  workspaceId: string;
}

export async function readFrontTableChunk({
  lastId,
  limit,
  tableName,
  workspaceId,
}: ReadTableChunkParams) {
  const workspace = await getWorkspaceInfos(workspaceId);
  assert(workspace, "Workspace not found");

  const idClause = lastId ? `AND id > ${lastId}` : "";

  const rows = await frontSequelize.query<{ id: ModelId }>(
    `SELECT * FROM "${tableName}"
     WHERE "workspaceId" = :workspaceId ${idClause}
     ORDER BY id
     LIMIT :limit`,
    {
      replacements: { workspaceId: workspace.id, limit },
      type: QueryTypes.SELECT,
      raw: true,
    }
  );

  const blob: RelocationBlob = {
    statements: {
      [tableName]: generateInsertStatements(tableName, rows, {
        onConflict: "ignore",
      }),
    },
  };

  const storagePath = await writeToRelocationStorage(blob, {
    workspaceId,
    type: "front",
    operation: `read_table_chunk_${tableName}`,
  });

  return {
    dataPath: storagePath,
    hasMore: rows.length === limit,
    lastId: rows[rows.length - 1]?.id ?? lastId,
  };
}
