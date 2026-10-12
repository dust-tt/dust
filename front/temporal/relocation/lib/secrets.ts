import type { ModelId } from "@app/types/shared/model_id";
import type { EncryptionUseCase } from "@app/types/shared/utils/encryption";

/**
 * @cc [owner:avervaet,label:security;backend] cell-encrypted-columns-are-listed
 * Every front column holding a value encrypted with a cell-specific secret MUST be listed here,
 * with the use case it is encrypted for. A listed column that is copied without re-encryption
 * cannot be decrypted in the destination cell.
 */
export const RELOCATED_SECRET_COLUMNS = {
  internal_mcp_server_credentials: {
    column: "encryptedKey",
    useCase: "mcp_server_credentials",
  },
  dust_app_secrets: {
    // Despite its name, the column holds the encrypted secret, not a hash.
    column: "hash",
    useCase: "developer_secret",
  },
  workspace_sandbox_env_vars: {
    column: "encryptedValue",
    useCase: "developer_secret",
  },
} as const satisfies Record<
  string,
  { column: string; useCase: EncryptionUseCase }
>;

export type RelocatedSecretTableName = keyof typeof RELOCATED_SECRET_COLUMNS;

export interface RelocatedSecret {
  tableName: RelocatedSecretTableName;
  id: ModelId;
  // The sId the value is encrypted against, identical in both cells.
  key: string;
  // Encrypted with the relocation transport secret, never the plaintext.
  transportValue: string;
}

export interface SecretsRelocationBlob {
  secrets: RelocatedSecret[];
}
