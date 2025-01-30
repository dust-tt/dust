import assert from "assert";

import { frontSequelize } from "@app/lib/resources/storage";
import logger from "@app/logger/logger";
import type {
  CoreEntitiesRelocationBlob,
  RelocationBlob,
} from "@app/temporal/relocation/activities/types";
import {
  deleteFromRelocationStorage,
  readFromRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import { RegionType } from "@app/lib/api/regions/config";

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
  const [workspaceSQL] = blob.statements.workspace;

  // 1) Create workspace.
  await frontSequelize.query(workspaceSQL);

  // 2) Create users in transaction.
  for (const userChunk of blob.statements.users) {
    await frontSequelize.transaction(async (transaction) => {
      await frontSequelize.query(userChunk, { transaction });
    });
  }

  // 3) Create users metadata in transaction.
  for (const userMetadataChunk of blob.statements.user_metadata) {
    await frontSequelize.transaction(async (transaction) => {
      await frontSequelize.query(userMetadataChunk, { transaction });
    });
  }

  // 4) Create plans that the workspace uses if not already existing.
  for (const planChunk of blob.statements.plans) {
    await frontSequelize.transaction(async (transaction) => {
      await frontSequelize.query(planChunk, { transaction });
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

  const blob = await readFromRelocationStorage<RelocationBlob>(dataPath);

  for (const [tableName, statements] of Object.entries(blob.statements)) {
    logger.info(
      { tableName, dataPath, statementCount: statements.length },
      "Executing SQL statements"
    );

    for (const statement of statements) {
      await frontSequelize.transaction(async (transaction) =>
        frontSequelize.query(statement, { transaction })
      );
    }
  }

  localLogger.info("[SQL] Table chunk written successfully.");

  await deleteFromRelocationStorage(dataPath);
}
