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
} from "@app/temporal/relocation/lib/file_storage/relocation";

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
}) {
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

  // 2) Create users in transaction.
  for (const { sql, params } of blob.statements.users) {
    await withTransaction(async (transaction) => {
      // eslint-disable-next-line dust/no-raw-sql
      await frontSequelize.query(sql, {
        bind: params,
        type: QueryTypes.INSERT,
        transaction,
      });
    });
  }

  // 3) Create users metadata in transaction.
  for (const { sql, params } of blob.statements.user_metadata) {
    await withTransaction(async (transaction) => {
      // eslint-disable-next-line dust/no-raw-sql
      await frontSequelize.query(sql, {
        bind: params,
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
}

export async function processFrontTableChunk({
  dataPath,
  destRegion,
  sourceRegion,
  tableName,
  workspaceId,
}: {
  dataPath: string;
  destRegion: string;
  sourceRegion: string;
  tableName: string;
  workspaceId: string;
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

  for (const [tableName, statements] of Object.entries(blob.statements)) {
    logger.info(
      { tableName, dataPath, statementCount: statements.length },
      "Executing SQL statements"
    );

    for (const { sql, params } of statements) {
      await withTransaction(async (transaction) =>
        // eslint-disable-next-line dust/no-raw-sql
        frontSequelize.query(sql, {
          bind: params,
          type: QueryTypes.INSERT,
          transaction,
        })
      );
    }
  }

  localLogger.info("[SQL] Table chunk written successfully.");

  await deleteFromRelocationStorage(dataPath);
}
