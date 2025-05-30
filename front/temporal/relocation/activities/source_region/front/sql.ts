import assert from "assert";
import { Op, QueryTypes } from "sequelize";

import type { RegionType } from "@app/lib/api/regions/config";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { Workspace } from "@app/lib/models/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  UserMetadataModel,
  UserModel,
} from "@app/lib/resources/storage/models/user";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type {
  CoreEntitiesRelocationBlob,
  ReadTableChunkParams,
  RelocationBlob,
} from "@app/temporal/relocation/activities/types";
import { writeToRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";
import { generateParameterizedInsertStatements } from "@app/temporal/relocation/lib/sql/insert";
import { getTopologicalOrder } from "@app/temporal/relocation/lib/sql/schema/dependencies";
import type { ModelId } from "@app/types";

export async function readCoreEntitiesFromSourceRegion({
  destRegion,
  sourceRegion,
  workspaceId,
}: {
  destRegion: RegionType;
  sourceRegion: RegionType;
  workspaceId: string;
}) {
  const localLogger = logger.child({
    destRegion,
    sourceRegion,
    workspaceId,
  });

  localLogger.info("[SQL Core Entities] Reading core entities.");

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

  // Fetch all associated users metadata of the workspace.
  const userMetadata = await UserMetadataModel.findAll({
    where: {
      userId: {
        [Op.in]: memberships.map((m) => m.userId),
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
  destRegion,
  lastId,
  limit,
  sourceRegion,
  tableName,
  workspaceId,
  fileName,
}: ReadTableChunkParams) {
  const localLogger = logger.child({
    destRegion,
    lastId,
    sourceRegion,
    tableName,
    workspaceId,
    fileName,
  });

  localLogger.info("[SQL Table] Reading table chunk");

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

  // Apply template ID mapping for agent_configurations
  // because some templates have a different ID in EU region
  if (
    tableName === "agent_configurations" &&
    sourceRegion === "us-central1" &&
    destRegion === "europe-west1"
  ) {
    const templateIdMapping: Record<number, number> = {
      64: 274877906952, // prospectQuestions
      65: 274877906944, // accountSnapshot
      66: 274877906953, // research
      68: 274877906957, // discoveryPrep
      69: 274877906948, // docBuilder
      70: 274877906954, // ticketClassify
      71: 274877906958, // incidentCommunication
      72: 274877906956, // dataCatalogExplorer
      73: 274877906950, // ITHelpDesk
      74: 274877906955, // askLegal
      75: 274877906951, // legalReview
    };

    for (const row of rows as [{ id: ModelId; templateId: number | null }]) {
      if (row.templateId != null && templateIdMapping[row.templateId]) {
        row.templateId = templateIdMapping[row.templateId];
      }
    }
  }

  const blob: RelocationBlob = {
    statements: {
      [tableName]: generateParameterizedInsertStatements(tableName, rows, {
        onConflict: "ignore",
      }),
    },
  };

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
    hasMore: rows.length === limit,
    lastId: rows[rows.length - 1]?.id ?? lastId,
  };
}
