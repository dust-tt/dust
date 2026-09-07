// biome-ignore-all lint/plugin/noRawSql: relocation SQL file requires raw SQL

import { frontSequelize } from "@app/lib/resources/storage";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import {
  buildDestinationIdNormalization,
  normalizeStatements,
  readDestinationIdNormalization,
  writeDestinationIdNormalization,
} from "@app/temporal/relocation/activities/destination_region/front/id_normalization";
import type {
  CoreEntitiesRelocationBlob,
  RelocationBlob,
} from "@app/temporal/relocation/activities/types";
import {
  deleteFromRelocationStorage,
  readFromRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import type { RegionType } from "@app/types/region";
import assert from "assert";
import { QueryTypes } from "sequelize";

interface WriteCoreEntitiesParams {
  dataPath: string;
  destRegion: RegionType;
  sourceRegion: RegionType;
  workspaceId: string;
}

export async function writeCoreEntitiesToDestinationRegionWithIdNormalization({
  dataPath,
  destRegion,
  sourceRegion,
  workspaceId,
}: WriteCoreEntitiesParams) {
  const localLogger = logger.child({
    destRegion,
    sourceRegion,
    workspaceId,
  });

  localLogger.info("[SQL Core Entities] Writing core entities.");

  // Get SQL from storage.
  const blob =
    await readFromRelocationStorage<CoreEntitiesRelocationBlob>(dataPath);

  const normalization = await buildDestinationIdNormalization({ blob });
  await writeDestinationIdNormalization({
    destRegion,
    normalization,
    sourceRegion,
    workspaceId,
  });

  assert(blob.statements.workspace.length === 1, "Expected one workspace SQL");
  const [workspaceStatements] = normalizeStatements({
    normalization,
    statements: blob.statements.workspace,
    tableName: "workspaces",
  });

  // 1) Create workspace.

  await frontSequelize.query(workspaceStatements.sql, {
    bind: workspaceStatements.params,
    type: QueryTypes.INSERT,
  });

  // 2) Create users in transaction.
  const userStatements = normalizeStatements({
    normalization,
    statements: blob.statements.users,
    tableName: "users",
  });
  for (const { sql, params } of userStatements) {
    await withTransaction(async (transaction) => {
      await frontSequelize.query(sql, {
        bind: params,
        type: QueryTypes.INSERT,
        transaction,
      });
    });
  }

  // 3) Create users metadata in transaction.
  const userMetadataStatements = normalizeStatements({
    normalization,
    statements: blob.statements.user_metadata,
    tableName: "user_metadata",
  });
  for (const { sql, params } of userMetadataStatements) {
    await withTransaction(async (transaction) => {
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

interface ProcessFrontTableChunkParams {
  dataPath: string;
  destRegion: RegionType;
  sourceRegion: RegionType;
  tableName: string;
  workspaceId: string;
}

export async function processFrontTableChunkWithIdNormalization({
  dataPath,
  destRegion,
  sourceRegion,
  tableName,
  workspaceId,
}: ProcessFrontTableChunkParams) {
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

  const normalization = await readDestinationIdNormalization({
    destRegion,
    sourceRegion,
    workspaceId,
  });

  for (const [tableName, statements] of Object.entries(blob.statements)) {
    logger.info(
      { tableName, dataPath, statementCount: statements.length },
      "Executing SQL statements"
    );

    const normalizedStatements = normalizeStatements({
      normalization,
      statements,
      tableName,
    });
    for (const { sql, params } of normalizedStatements) {
      await withTransaction(async (transaction) =>
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
