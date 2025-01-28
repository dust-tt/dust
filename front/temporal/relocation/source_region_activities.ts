import type { ModelId } from "@dust-tt/types";
import { Op, QueryTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { generateTableSQL } from "@app/temporal/relocation/sql_generator";
import { getTopologicallySortedTables } from "@app/temporal/relocation/sql_tables";
import { writeToRelocationStorage } from "@app/temporal/relocation/storage";
import type { RelocationBlob } from "@app/temporal/relocation/types";

export async function readWorkspaceAndUsersFromSourceRegion({
  workspaceId,
}: {
  workspaceId: ModelId;
}) {
  // Find the raw workspace.
  const workspace = await Workspace.findOne({
    where: {
      id: workspaceId,
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
      replacements: { workspaceId },
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

  const blob: RelocationBlob<"plans" | "users" | "workspace"> = {
    statements: {
      plans: generateTableSQL("plans", plans, { onConflict: "ignore" }),
      users: generateTableSQL("users", users, { onConflict: "ignore" }),
      workspace: generateTableSQL("workspaces", [workspace], {
        onConflict: "ignore",
      }),
    },
  };

  // We store the data in a storage.
  const storagePath = await writeToRelocationStorage(blob, {
    workspaceId,
    type: "front",
    operation: "read_workspace_and_users",
  });

  // Return the path (not the data) to preserve activity return size.
  return storagePath;
}

export async function getTablesWithWorkspaceIdOrder() {
  return getTopologicallySortedTables(frontSequelize);
}

interface ReadTableChunkParams {
  lastId?: ModelId;
  limit: number;
  tableName: string;
  workspaceId: ModelId;
}

export async function readFrontTableChunk({
  lastId,
  limit,
  tableName,
  workspaceId,
}: ReadTableChunkParams) {
  const idClause = lastId ? `AND id > ${lastId}` : "";

  const rows = await frontSequelize.query<{ id: ModelId }>(
    `SELECT * FROM "${tableName}"
     WHERE "workspaceId" = :workspaceId ${idClause}
     ORDER BY id
     LIMIT :limit`,
    {
      replacements: { workspaceId, limit },
      type: QueryTypes.SELECT,
      raw: true,
    }
  );

  const blob: RelocationBlob = {
    statements: {
      [tableName]: generateTableSQL(tableName, rows, { onConflict: "ignore" }),
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
