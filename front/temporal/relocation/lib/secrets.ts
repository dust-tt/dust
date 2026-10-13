import config from "@app/lib/api/config";
import type { ModelId } from "@app/types/shared/model_id";
import type { EncryptionUseCase } from "@app/types/shared/utils/encryption";
import crypto from "crypto";

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
  // Encrypted for relocation transport, never the plaintext.
  transportValue: string;
}

export interface SecretsRelocationBlob {
  secrets: RelocatedSecret[];
}

const TRANSPORT_FORMAT_VERSION = "v1";
const TRANSPORT_ALGORITHM = "aes-256-gcm";
const TRANSPORT_IV_LENGTH = 12;
const TRANSPORT_AUTH_TAG_LENGTH = 16;

interface RelocationTransportContext {
  workflowId: string;
  workspaceId: string;
  secret: Pick<RelocatedSecret, "tableName" | "id" | "key">;
}

// Scoping the key to one relocation keeps a staged object from being decrypted with another
// relocation's key.
function deriveRelocationTransportKey(workflowId: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      config.getRelocationTransportSecret(),
      workflowId,
      "dust-relocation-transport",
      32
    )
  );
}

// Binding the ciphertext to its row stops a staged value from being moved onto another row.
function buildRelocationTransportAad({
  workspaceId,
  secret: { tableName, id, key },
}: RelocationTransportContext): Buffer {
  return Buffer.from(
    JSON.stringify([TRANSPORT_FORMAT_VERSION, workspaceId, tableName, id, key])
  );
}

/**
 * @cc [owner:avervaet,label:security] relocation-transport-is-authenticated-and-scoped
 * Values MUST be encrypted with an authenticated cipher, a fresh random IV per value, and a key
 * derived from `RELOCATION_TRANSPORT_SECRET` and the relocation workflow id. The ciphertext MUST be
 * bound to its workspace, table, row id and sId, so decrypting it under any other of these fails.
 */
/**
 * @cc [owner:avervaet,label:security] relocation-transport-secret-is-dedicated
 * `RELOCATION_TRANSPORT_SECRET` MUST be identical in every cell and used for nothing but
 * relocation transport: not as an auth token, and not for any other encryption.
 */
export function encryptForRelocationTransport(
  plaintext: string,
  context: RelocationTransportContext
): string {
  const iv = crypto.randomBytes(TRANSPORT_IV_LENGTH);
  const cipher = crypto.createCipheriv(
    TRANSPORT_ALGORITHM,
    deriveRelocationTransportKey(context.workflowId),
    iv,
    { authTagLength: TRANSPORT_AUTH_TAG_LENGTH }
  );
  cipher.setAAD(buildRelocationTransportAad(context));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64"
  );
}

export function decryptForRelocationTransport(
  transportValue: string,
  context: RelocationTransportContext
): string {
  const payload = Buffer.from(transportValue, "base64");
  const iv = payload.subarray(0, TRANSPORT_IV_LENGTH);
  const authTag = payload.subarray(
    TRANSPORT_IV_LENGTH,
    TRANSPORT_IV_LENGTH + TRANSPORT_AUTH_TAG_LENGTH
  );
  const ciphertext = payload.subarray(
    TRANSPORT_IV_LENGTH + TRANSPORT_AUTH_TAG_LENGTH
  );

  const decipher = crypto.createDecipheriv(
    TRANSPORT_ALGORITHM,
    deriveRelocationTransportKey(context.workflowId),
    iv,
    { authTagLength: TRANSPORT_AUTH_TAG_LENGTH }
  );
  decipher.setAAD(buildRelocationTransportAad(context));
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
