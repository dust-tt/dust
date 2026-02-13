import assert from "assert";
import { Op, QueryTypes } from "sequelize";

import type { RegionType } from "@app/lib/api/regions/config";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
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
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";

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
export async function prepareDestinationUserMapping({
  destRegion,
  sourceRegion,
  workspaceId,
  usersDataPath,
}: {
  destRegion: RegionType;
  sourceRegion: RegionType;
  workspaceId: string;
  usersDataPath: string | null;
}): Promise<string | null> {
  const localLogger = logger.child({
    destRegion,
    sourceRegion,
    workspaceId,
  });

  if (!usersDataPath) {
    localLogger.info(
      "[SQL Core Entities] No users data provided for mapping, skipping."
    );
    return null;
  }

  try {
    const usersForMapping =
      await readFromRelocationStorage<
        { id: ModelId; workOSUserId: string | null }[]
      >(usersDataPath);

    const workOSUserIds = Array.from(
      new Set(
        usersForMapping
          .map((user) => user.workOSUserId)
          .filter((workOSUserId): workOSUserId is string => !!workOSUserId)
      )
    );

    if (workOSUserIds.length === 0) {
      localLogger.info(
        "[SQL Core Entities] No WorkOS users to reconcile, skipping mapping."
      );
      return null;
    }

    const existingUsers = await UserModel.findAll({
      attributes: ["id", "workOSUserId"],
      where: {
        workOSUserId: {
          [Op.in]: workOSUserIds,
        },
      },
      raw: true,
    });

    if (existingUsers.length === 0) {
      localLogger.info(
        "[SQL Core Entities] No conflicting users found in destination region."
      );
      return null;
    }

    const existingUsersByWorkOSId = new Map<string, ModelId>(
      removeNulls(
        existingUsers.map((user) =>
          user.workOSUserId ? [user.workOSUserId, user.id] : null
        )
      )
    );

    const mapping: Record<string, ModelId> = {};
    for (const user of usersForMapping) {
      if (!user.workOSUserId) {
        continue;
      }
      const destinationUserId = existingUsersByWorkOSId.get(user.workOSUserId);
      if (destinationUserId) {
        mapping[user.id.toString()] = destinationUserId;
      }
    }

    const mappingSize = Object.keys(mapping).length;
    if (mappingSize === 0) {
      localLogger.info(
        "[SQL Core Entities] No divergent user IDs detected, mapping not created."
      );
      return null;
    }

    const userIdMappingPath = await writeToRelocationStorage(mapping, {
      workspaceId,
      type: "front",
      operation: "user_id_mapping",
    });

    localLogger.info(
      { mappingSize, userIdMappingPath },
      "[SQL Core Entities] Created user ID mapping for destination region."
    );

    return userIdMappingPath;
  } finally {
    await deleteFromRelocationStorage(usersDataPath);
  }
}
