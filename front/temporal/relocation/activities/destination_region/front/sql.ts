import assert from "assert";
import { QueryTypes } from "sequelize";

import type { RegionType } from "@app/lib/api/regions/config";
import { frontSequelize } from "@app/lib/resources/storage";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type {
  CoreEntitiesRelocationBlob,
  RelocationBlob,
} from "@app/temporal/relocation/activities/types";
import {
  deleteFromRelocationStorage,
  readFromRelocationStorage,
  writeToRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import type { ModelId } from "@app/types";

export async function writeCoreEntitiesToDestinationRegion({
  dataPath,
  destRegion,
  sourceRegion,
  workspaceId,
}: {
  dataPath: string;
  destRegion: RegionType;
  sourceRegion: RegionType;
  workspaceId: string;
}): Promise<{ userIdMappingPath: string }> {
  const localLogger = logger.child({
    destRegion,
    sourceRegion,
    workspaceId,
  });

  localLogger.info("[SQL Core Entities] Writing core entities.");

  // Get SQL from storage.
  const blob =
    await readFromRelocationStorage<CoreEntitiesRelocationBlob>(dataPath);

  assert(blob.statements.workspace.length === 1, "Expected one workspace SQL");
  const [workspaceStatements] = blob.statements.workspace;

  // 1) Create workspace.
  // eslint-disable-next-line dust/no-raw-sql
  await frontSequelize.query(workspaceStatements.sql, {
    bind: workspaceStatements.params,
    type: QueryTypes.INSERT,
  });

  // 2) Handle users with potential WorkOS ID conflicts.
  // Build a mapping from source user IDs to destination user IDs.
  const userIdMapping = new Map<ModelId, ModelId>();

  for (const { sql, params } of blob.statements.users) {
    await withTransaction(async (transaction) => {
      // Extract column positions (minimal parsing - just need to know where id and email are)
      const columnMatch = sql.match(/INSERT INTO "users" \((.*?)\) VALUES/);
      if (!columnMatch) {
        throw new Error("Failed to parse user INSERT statement");
      }
      const columns = columnMatch[1]
        .split(",")
        .map((col) => col.trim().replace(/"/g, ""));
      const idIndex = columns.indexOf("id");
      const numColumns = columns.length;

      // Modify the SQL to use ON CONFLICT with DO UPDATE to detect conflicts
      // xmax = 0 tells us if it was an insert (true) or conflict (false)
      const modifiedSql = sql.replace(
        /ON CONFLICT DO NOTHING/,
        `ON CONFLICT ("workOSUserId") DO UPDATE SET "workOSUserId" = EXCLUDED."workOSUserId" RETURNING id, "workOSUserId", email, xmax = 0 AS inserted`
      );

      // Execute the INSERT/UPDATE
      // eslint-disable-next-line dust/no-raw-sql
      const results = await frontSequelize.query<{
        id: ModelId;
        workOSUserId: string | null;
        email: string;
        inserted: boolean;
      }>(modifiedSql, {
        bind: params,
        type: QueryTypes.SELECT,
        transaction,
      });

      // Process results to build mapping for conflicted users
      // Correlate with params to get source IDs
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result.inserted) {
          const sourceUserId = params[i * numColumns + idIndex] as ModelId;

          // This was a conflict - user already existed
          // Map source ID to the existing destination ID
          userIdMapping.set(sourceUserId, result.id);

          localLogger.info(
            {
              sourceUserId,
              destinationUserId: result.id,
              workOSUserId: result.workOSUserId,
              email: result.email,
            },
            "[SQL Core Entities] Found existing user with same workOSUserId, mapping to existing user"
          );
        }
      }
    });
  }

  localLogger.info(
    { mappingSize: userIdMapping.size },
    "[SQL Core Entities] User ID mapping created"
  );

  // 3) Create users metadata in transaction, applying user ID mapping.
  for (const { sql, params } of blob.statements.user_metadata) {
    await withTransaction(async (transaction) => {
      // Apply user ID mapping to user_metadata using the helper function
      const mappedParams =
        userIdMapping.size > 0
          ? applyUserIdMapping(sql, params, userIdMapping, localLogger)
          : params;

      // eslint-disable-next-line dust/no-raw-sql
      await frontSequelize.query(sql, {
        bind: mappedParams,
        type: QueryTypes.INSERT,
        transaction,
      });
    });
  }

  // 4) Create plans that the workspace uses if not already existing.
  for (const { sql, params } of blob.statements.plans) {
    await withTransaction(async (transaction) => {
      // eslint-disable-next-line dust/no-raw-sql
      await frontSequelize.query(sql, {
        bind: params,
        type: QueryTypes.INSERT,
        transaction,
      });
    });
  }

  localLogger.info("[SQL Core Entities] Core entities written successfully.");

  await deleteFromRelocationStorage(dataPath);

  // Store the user ID mapping for use in table processing
  const userIdMappingPath = await writeToRelocationStorage(
    Object.fromEntries(userIdMapping),
    {
      workspaceId,
      type: "front",
      operation: "user_id_mapping",
    }
  );

  localLogger.info(
    { userIdMappingPath, mappingSize: userIdMapping.size },
    "[SQL Core Entities] User ID mapping stored"
  );

  return { userIdMappingPath };
}

export async function processFrontTableChunk({
  dataPath,
  destRegion,
  sourceRegion,
  tableName,
  workspaceId,
  userIdMappingPath,
}: {
  dataPath: string;
  destRegion: string;
  sourceRegion: string;
  tableName: string;
  workspaceId: string;
  userIdMappingPath?: string;
}) {
  const localLogger = logger.child({
    destRegion,
    sourceRegion,
    tableName,
    workspaceId,
  });

  localLogger.info("[SQL] Writing table chunk.");

  let blob: RelocationBlob;
  try {
    blob = await readFromRelocationStorage<RelocationBlob>(dataPath);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.includes("Cannot create a string longer than")
    ) {
      localLogger.warn(
        { error: error.message, dataPath },
        "[SQL] File too large to process, skipping with empty blob."
      );
      blob = { statements: {} };
    } else {
      throw error;
    }
  }

  // Load user ID mapping if provided
  let userIdMapping: Map<ModelId, ModelId> | undefined;
  if (userIdMappingPath) {
    try {
      const mappingData =
        await readFromRelocationStorage<Record<string, ModelId>>(
          userIdMappingPath
        );
      userIdMapping = new Map(
        Object.entries(mappingData).map(([k, v]) => [Number(k) as ModelId, v])
      );
      localLogger.info(
        { mappingSize: userIdMapping.size },
        "[SQL] Loaded user ID mapping"
      );
    } catch (error) {
      localLogger.warn(
        { error, userIdMappingPath },
        "[SQL] Failed to load user ID mapping, proceeding without it"
      );
    }
  }

  for (const [tableName, statements] of Object.entries(blob.statements)) {
    logger.info(
      { tableName, dataPath, statementCount: statements.length },
      "Executing SQL statements"
    );

    for (const { sql, params } of statements) {
      await withTransaction(async (transaction) => {
        // Apply user ID mapping if provided and table has userId column
        let mappedParams = params;

        if (userIdMapping && userIdMapping.size > 0) {
          mappedParams = applyUserIdMapping(
            sql,
            params,
            userIdMapping,
            localLogger
          );
        }

        // eslint-disable-next-line dust/no-raw-sql
        await frontSequelize.query(sql, {
          bind: mappedParams,
          type: QueryTypes.INSERT,
          transaction,
        });
      });
    }
  }

  localLogger.info("[SQL] Table chunk written successfully.");

  await deleteFromRelocationStorage(dataPath);
}

/**
 * Generic function to apply ID mappings to SQL statement parameters.
 * Can be used for any type of ID mapping (users, workspaces, etc.)
 */
function applyIdMapping(
  sql: string,
  params: any[],
  columnNames: string[],
  idMapping: Map<ModelId, ModelId>,
  localLogger: typeof logger,
  logPrefix: string
): any[] {
  // Extract table name and columns from INSERT statement
  const tableMatch = sql.match(/INSERT INTO "([^"]+)" \((.*?)\) VALUES/);
  if (!tableMatch) {
    return params;
  }

  const tableName = tableMatch[1];
  const columns = tableMatch[2]
    .split(",")
    .map((col) => col.trim().replace(/"/g, ""));

  // Find indices of columns that need mapping
  const columnIndices: Array<{ name: string; index: number }> = [];
  columnNames.forEach((colName) => {
    const idx = columns.indexOf(colName);
    if (idx !== -1) {
      columnIndices.push({ name: colName, index: idx });
    }
  });

  if (columnIndices.length === 0) {
    // No columns to map in this table
    return params;
  }

  // Parse values section to determine number of rows
  const valuesSection = sql.match(/VALUES (.*?)(;| ON CONFLICT)/)?.[1];
  if (!valuesSection) {
    return params;
  }

  const rowMatches = valuesSection.match(/\([^)]+\)/g);
  if (!rowMatches) {
    return params;
  }

  const numColumns = columns.length;
  const mappedParams = [...params];
  let paramIndex = 0;
  let mappedCount = 0;

  for (const _ of rowMatches) {
    // For each column in this row, apply the mapping
    for (const { index } of columnIndices) {
      const actualParamIndex = paramIndex + index;
      const sourceId = params[actualParamIndex] as ModelId | null;

      if (sourceId !== null && sourceId !== undefined) {
        const destinationId = idMapping.get(sourceId);

        if (destinationId !== undefined) {
          mappedParams[actualParamIndex] = destinationId;
          mappedCount++;
        }
      }
    }

    paramIndex += numColumns;
  }

  if (mappedCount > 0) {
    localLogger.info(
      {
        tableName,
        mappedCount,
        columns: columnIndices.map((c) => c.name),
      },
      `[SQL] ${logPrefix}`
    );
  }

  return mappedParams;
}

/**
 * Apply user ID mapping to SQL statement parameters.
 * Handles userId and other user-related foreign key columns.
 */
function applyUserIdMapping(
  sql: string,
  params: any[],
  userIdMapping: Map<ModelId, ModelId>,
  localLogger: typeof logger
): any[] {
  // User-related foreign key column names from Sequelize models
  // Verified by scanning all models in lib/resources/storage/models and lib/models
  const userColumnNames = [
    "authorId", // AgentConfiguration
    "editedByUserId", // DataSource, DataSourceView, MCPServerView, WebhookSourcesView
    "editor", // Trigger
    "invitedUserId", // MembershipInvitation
    "sharedBy", // FileShare
    "userId", // All other models
  ];

  return applyIdMapping(
    sql,
    params,
    userColumnNames,
    userIdMapping,
    localLogger,
    "Applied user ID mapping to table"
  );
}
