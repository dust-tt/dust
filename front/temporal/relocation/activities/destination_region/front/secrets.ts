/* oxlint-disable dust/noRawSql -- relocation SQL file requires raw SQL */

import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import {
  deleteFromRelocationStorage,
  readFromRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import type {
  RelocatedSecretTableName,
  SecretsRelocationBlob,
} from "@app/temporal/relocation/lib/secrets";
import { RELOCATED_SECRET_COLUMNS } from "@app/temporal/relocation/lib/secrets";
import type { CellType } from "@app/types/cell";
import { decrypt, encrypt } from "@app/types/shared/utils/encryption";
import assert from "assert";
import { QueryTypes } from "sequelize";

/**
 * @cc [owner:avervaet,label:security;backend] secrets-reencrypted-for-destination
 * Each staged secret MUST be written back to its row, encrypted with the destination cell's
 * secret for the column's use case, so the destination can decrypt it with the same sId.
 */
/**
 * @cc [owner:avervaet,label:error-handling] reencryption-is-all-or-nothing
 * If any staged secret's row is missing from the destination workspace, the activity MUST fail
 * without updating any row and leave the staged object intact. Re-running it MUST be safe.
 */
/**
 * @cc [owner:avervaet,label:security] staged-secrets-always-cleaned-up
 * The staged object MUST be deleted once re-encryption ends, whether it succeeded or failed.
 */
export async function reencryptSecretsInDestinationRegion({
  dataPath,
  destCell,
  sourceCell,
  workspaceId,
}: {
  dataPath: string;
  destCell: CellType;
  sourceCell: CellType;
  workspaceId: string;
}) {
  const localLogger = logger.child({ destCell, sourceCell, workspaceId });

  const [blob, workspace] = await Promise.all([
    readFromRelocationStorage<SecretsRelocationBlob>(dataPath),
    getWorkspaceInfos(workspaceId),
  ]);
  assert(workspace, "Workspace not found");

  const secretsByTable = new Map<
    RelocatedSecretTableName,
    { ids: number[]; values: string[] }
  >();
  for (const { tableName, id, key, transportValue } of blob.secrets) {
    const plaintext = decrypt({
      encrypted: transportValue,
      key,
      useCase: "relocation_transport",
    });
    const value = encrypt({
      text: plaintext,
      key,
      useCase: RELOCATED_SECRET_COLUMNS[tableName].useCase,
    });

    const tableSecrets = secretsByTable.get(tableName) ?? {
      ids: [],
      values: [],
    };
    secretsByTable.set(tableName, {
      ids: [...tableSecrets.ids, id],
      values: [...tableSecrets.values, value],
    });
  }

  // Check every row first so a missing one fails before anything is written.
  for (const [tableName, { ids }] of secretsByTable) {
    const [{ count }] = await frontSequelize.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM "${tableName}"
       WHERE id = ANY($ids::bigint[]) AND "workspaceId" = $workspaceModelId`,
      {
        bind: { ids, workspaceModelId: workspace.id },
        type: QueryTypes.SELECT,
      }
    );
    if (Number(count) !== ids.length) {
      throw new Error(
        `Expected ${ids.length} ${tableName} rows to re-encrypt, found ${count}.`
      );
    }
  }

  await withTransaction(async (transaction) => {
    for (const [tableName, { ids, values }] of secretsByTable) {
      const { column } = RELOCATED_SECRET_COLUMNS[tableName];

      await frontSequelize.query(
        `UPDATE "${tableName}" AS t
         SET "${column}" = s.value
         FROM UNNEST($ids::bigint[], $values::text[]) AS s(id, value)
         WHERE t.id = s.id AND t."workspaceId" = $workspaceModelId`,
        {
          bind: { ids, values, workspaceModelId: workspace.id },
          transaction,
          type: QueryTypes.BULKUPDATE,
        }
      );
    }
  });

  localLogger.info(
    { secretCount: blob.secrets.length },
    "[Secrets] Secrets re-encrypted successfully."
  );
}

export async function deleteStagedSecretsInDestinationRegion({
  dataPath,
}: {
  dataPath: string;
}) {
  await deleteFromRelocationStorage(dataPath);
}
