import assert from "assert";

import { frontSequelize } from "@app/lib/resources/storage";
import logger from "@app/logger/logger";
import type {
  CoreEntitiesRelocationBlob,
  RelocationBlob,
} from "@app/temporal/relocation/activities/types";
import { readFromRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";

export async function writeCoreEntitiesToDestinationRegion({
  dataPath,
}: {
  dataPath: string;
}) {
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

  // 3) Create plans that the workspace uses if not already existing.
  for (const planChunk of blob.statements.plans) {
    await frontSequelize.transaction(async (transaction) => {
      await frontSequelize.query(planChunk, { transaction });
    });
  }

  // TODO: Ensure all data is created.
}

export async function processFrontTableChunk({
  dataPath,
}: {
  dataPath: string;
}) {
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
}
