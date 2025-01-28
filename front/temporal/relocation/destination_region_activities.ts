import assert from "assert";

import { frontSequelize } from "@app/lib/resources/storage";
import logger from "@app/logger/logger";
import { readFromRelocationStorage } from "@app/temporal/relocation/storage";
import type { RelocationBlob } from "@app/temporal/relocation/types";

export async function writeWorkspaceAndUsersToDestinationRegion({
  dataPath,
}: {
  dataPath: string;
}) {
  // Get SQL from storage.
  const blob =
    await readFromRelocationStorage<
      RelocationBlob<"plans" | "users" | "workspace">
    >(dataPath);

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

// Generic SQL executor for everything else
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
