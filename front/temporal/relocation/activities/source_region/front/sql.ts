import assert from "assert";
import { Op, QueryTypes } from "sequelize";

import type { RegionType } from "@app/lib/api/regions/config";
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
  readFromRelocationStorage,
  withJSONSerializationRetry,
  writeToRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import { generateParameterizedInsertStatements } from "@app/temporal/relocation/lib/sql/insert";
import { getTopologicalOrder } from "@app/temporal/relocation/lib/sql/schema/dependencies";
import type { UserIdMapping } from "@app/temporal/relocation/lib/sql/user_mappings";
import { mapUserIdsInRows } from "@app/temporal/relocation/lib/sql/user_mappings";
import type { ModelId } from "@app/types/shared/model_id";

const userIdMappingCache = new Map<string, UserIdMapping>();

async function loadUserIdMapping(
  userIdMappingPath?: string | null
): Promise<UserIdMapping> {
  if (!userIdMappingPath) {
    return new Map();
  }

  const cached = userIdMappingCache.get(userIdMappingPath);
  if (cached) {
    return cached;
  }

  const mappingRecord =
    await readFromRelocationStorage<Record<string, ModelId>>(userIdMappingPath);
  const mappingEntries = Object.entries(mappingRecord).map(
    ([sourceId, destId]) => [Number(sourceId), destId] as const
  );
  const mapping = new Map<ModelId, ModelId>(mappingEntries);
  userIdMappingCache.set(userIdMappingPath, mapping);
  return mapping;
}

export async function collectWorkspaceUsersForMapping({
  destRegion,
  sourceRegion,
  workspaceId,
}: {
  destRegion: RegionType;
  sourceRegion: RegionType;
  workspaceId: string;
}): Promise<string | null> {
  const localLogger = logger.child({
    destRegion,
    sourceRegion,
    workspaceId,
  });

  localLogger.info("[SQL Users] Collecting users for mapping.");

  const workspace = await WorkspaceModel.findOne({
    where: {
      sId: workspaceId,
    },
    raw: true,
  });
  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  const { memberships } = await MembershipResource.getMembershipsForWorkspace({
    workspace: renderLightWorkspaceType({ workspace }),
  });
  const userIds = Array.from(new Set(memberships.map((m) => m.userId)));

  if (userIds.length === 0) {
    localLogger.info("[SQL Users] No users associated with workspace.");
    return null;
  }

  const users = await UserModel.findAll({
    attributes: ["id", "workOSUserId"],
    where: {
      id: {
        [Op.in]: userIds,
      },
    },
    raw: true,
  });

  const payload = users.map((user) => ({
    id: user.id,
    workOSUserId: user.workOSUserId,
  }));

  const dataPath = await writeToRelocationStorage(payload, {
    workspaceId,
    type: "front",
    operation: "collect_workspace_users_for_mapping",
  });

  localLogger.info({ dataPath }, "[SQL Users] Collected users for mapping.");

  return dataPath;
}

export async function readCoreEntitiesFromSourceRegion({
  destRegion,
  sourceRegion,
  workspaceId,
  userIdMappingPath,
}: {
  destRegion: RegionType;
  sourceRegion: RegionType;
  workspaceId: string;
  userIdMappingPath?: string | null;
}) {
  const localLogger = logger.child({
    destRegion,
    sourceRegion,
    workspaceId,
  });

  localLogger.info("[SQL Core Entities] Reading core entities.");

  const userIdMapping = await loadUserIdMapping(userIdMappingPath);
  if (userIdMapping.size > 0) {
    localLogger.info(
      { mappingSize: userIdMapping.size },
      "[SQL Core Entities] Applying user ID mapping to source data."
    );
  }

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

  const usersForInsertion =
    userIdMapping.size > 0
      ? users.filter((user) => !userIdMapping.has(user.id))
      : users;

  // Fetch all associated users metadata of the workspace.
  // Only fetch metadata where workspaceId is null (global) or matches the workspace being
  // relocated. This avoids FK violations when inserting into destination region for metadata
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

  const userMetadataForInsertion =
    userIdMapping.size > 0
      ? userMetadata.map((metadata) => {
          const mappedUserId = userIdMapping.get(metadata.userId);
          if (mappedUserId !== undefined && mappedUserId !== metadata.userId) {
            return {
              ...metadata,
              userId: mappedUserId,
            };
          }
          return metadata;
        })
      : userMetadata;

  // eslint-disable-next-line dust/no-raw-sql
  const subscriptions = await frontSequelize.query<{ planId: ModelId }>(
    'SELECT * FROM subscriptions WHERE "workspaceId" = :workspaceId',
    {
      replacements: { workspaceId: workspace.id },
      type: QueryTypes.SELECT,
      raw: true,
    }
  );

  // eslint-disable-next-line dust/no-raw-sql
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
      users: generateParameterizedInsertStatements("users", usersForInsertion, {
        onConflict: "ignore",
      }),
      user_metadata: generateParameterizedInsertStatements(
        "user_metadata",
        userMetadataForInsertion,
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
  userIdMappingPath,
}: ReadTableChunkParams & { userIdMappingPath?: string | null }) {
  const localLogger = logger.child({
    destRegion,
    lastId,
    sourceRegion,
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

  // eslint-disable-next-line dust/no-raw-sql
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

  const userIdMapping = await loadUserIdMapping(userIdMappingPath);
  const normalizedRows =
    userIdMapping.size > 0 ? mapUserIdsInRows(rows, userIdMapping) : rows;

  const blob: RelocationBlob = {
    statements: {
      [tableName]: generateParameterizedInsertStatements(
        tableName,
        normalizedRows,
        {
          onConflict: "ignore",
        }
      ),
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
