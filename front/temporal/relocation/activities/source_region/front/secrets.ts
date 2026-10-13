/* oxlint-disable dust/noRawSql -- relocation SQL file requires raw SQL */

import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import logger from "@app/logger/logger";
import { writeToRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";
import type {
  RelocatedSecret,
  RelocatedSecretTableName,
  SecretsRelocationBlob,
} from "@app/temporal/relocation/lib/secrets";
import {
  encryptForRelocationTransport,
  RELOCATED_SECRET_COLUMNS,
} from "@app/temporal/relocation/lib/secrets";
import type { CellType } from "@app/types/cell";
import type { ModelId } from "@app/types/shared/model_id";
import { decrypt } from "@app/types/shared/utils/encryption";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import { QueryTypes } from "sequelize";

interface EncryptedRow {
  tableName: RelocatedSecretTableName;
  id: ModelId;
  key: string;
  value: string;
}

/**
 * @cc [owner:avervaet,label:security] staged-secrets-never-plaintext
 * Secret values written to relocation storage MUST be encrypted for relocation transport. Plaintext values and values encrypted with the source cell's secrets MUST NOT be staged.
 */
/**
 * @cc [owner:avervaet,label:error-handling] undecryptable-source-secret-fails
 * A listed secret that cannot be decrypted with the source cell's secret MUST fail the activity,
 * naming its table and row id but never its value. It MUST NOT be skipped.
 */
/**
 * @cc [owner:avervaet,label:performance] no-secrets-skips-staging
 * When the workspace holds no listed secret, nothing is staged and the activity returns `null`.
 */
export async function readSecretsFromSourceRegion({
  destCell,
  sourceCell,
  workflowId,
  workspaceId,
}: {
  destCell: CellType;
  sourceCell: CellType;
  workflowId: string;
  workspaceId: string;
}): Promise<string | null> {
  const localLogger = logger.child({ destCell, sourceCell, workspaceId });

  const workspace = await getWorkspaceInfos(workspaceId);
  assert(workspace, "Workspace not found");

  const replacements = { workspaceId: workspace.id };

  const mcpCredentials = await frontSequelize.query<{
    id: ModelId;
    value: string;
  }>(
    `SELECT id, "encryptedKey" AS value FROM internal_mcp_server_credentials
     WHERE "workspaceId" = :workspaceId AND "encryptedKey" IS NOT NULL`,
    { replacements, type: QueryTypes.SELECT }
  );

  const dustAppSecrets = await frontSequelize.query<{
    id: ModelId;
    value: string;
  }>(
    `SELECT id, hash AS value FROM dust_app_secrets
     WHERE "workspaceId" = :workspaceId`,
    { replacements, type: QueryTypes.SELECT }
  );

  // Pod-scoped variables are encrypted against the pod's sId, workspace-scoped ones against the
  // workspace's.
  const sandboxEnvVars = await frontSequelize.query<{
    id: ModelId;
    spaceId: ModelId | null;
    value: string;
  }>(
    `SELECT id, "spaceId", "encryptedValue" AS value FROM workspace_sandbox_env_vars
     WHERE "workspaceId" = :workspaceId`,
    { replacements, type: QueryTypes.SELECT }
  );

  const rows: EncryptedRow[] = [
    ...mcpCredentials.map(({ id, value }) => ({
      tableName: "internal_mcp_server_credentials" as const,
      id,
      key: workspace.sId,
      value,
    })),
    ...dustAppSecrets.map(({ id, value }) => ({
      tableName: "dust_app_secrets" as const,
      id,
      key: workspace.sId,
      value,
    })),
    ...sandboxEnvVars.map(({ id, spaceId, value }) => ({
      tableName: "workspace_sandbox_env_vars" as const,
      id,
      key:
        spaceId === null
          ? workspace.sId
          : SpaceResource.modelIdToSId({
              id: spaceId,
              workspaceId: workspace.id,
            }),
      value,
    })),
  ];

  if (rows.length === 0) {
    localLogger.info("[Secrets] No secrets to relocate.");
    return null;
  }

  const secrets: RelocatedSecret[] = [];
  for (const { tableName, id, key, value } of rows) {
    let plaintext: string;
    try {
      plaintext = decrypt({
        encrypted: value,
        key,
        useCase: RELOCATED_SECRET_COLUMNS[tableName].useCase,
      });
    } catch (err) {
      throw new Error(
        `Failed to decrypt ${tableName} row ${id} with the source cell secret: ${
          normalizeError(err).message
        }`
      );
    }

    secrets.push({
      tableName,
      id,
      key,
      transportValue: encryptForRelocationTransport(plaintext, {
        workflowId,
        workspaceId,
        secret: { tableName, id, key },
      }),
    });
  }

  // A fixed name keeps retries overwriting the same object instead of leaving earlier uploads
  // behind in the bucket.
  const blob: SecretsRelocationBlob = { secrets };
  const dataPath = await writeToRelocationStorage(blob, {
    workspaceId,
    type: "front",
    operation: "read_secrets",
    fileName: "secrets",
  });

  localLogger.info(
    { dataPath, secretCount: secrets.length },
    "[Secrets] Secrets read successfully."
  );

  return dataPath;
}
