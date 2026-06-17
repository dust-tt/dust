import config from "@app/lib/api/config";
import { assertNever } from "@app/types/shared/utils/assert_never";
import crypto from "crypto";

type EncryptionUseCase = "developer_secret" | "mcp_server_credentials";

export function md5(str: string): string {
  return crypto.createHash("md5").update(str).digest("hex");
}

export function sha256(str: string): string {
  return crypto.createHash("sha256").update(str).digest("base64");
}

function getSecretForUseCase(useCase: EncryptionUseCase): string {
  switch (useCase) {
    case "developer_secret":
      return config.getDeveloperSecretsSecret();
    case "mcp_server_credentials":
      return config.getMCPServerCredentialsSecret();
    default:
      assertNever(useCase);
  }
}

function saltedKey(key: string, useCase: EncryptionUseCase, size = 32): string {
  return crypto
    .createHash("sha256")
    .update(getSecretForUseCase(useCase) + key)
    .digest("base64")
    .substring(0, size);
}

const ENCRYPTION_V2_PREFIX = "v2";
const AES_GCM_IV_LENGTH_BYTES = 12;

function legacyIv(key: string): string {
  return md5(key).substring(0, 16);
}

function legacyDecrypt({
  encrypted,
  key,
  useCase,
}: {
  encrypted: string;
  key: string;
  useCase: EncryptionUseCase;
}): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    saltedKey(key, useCase),
    legacyIv(key)
  );
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function encrypt({
  text,
  key,
  useCase,
}: {
  text: string;
  key: string;
  useCase: EncryptionUseCase;
}): string {
  const iv = crypto.randomBytes(AES_GCM_IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    saltedKey(key, useCase),
    iv
  );
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return [
    ENCRYPTION_V2_PREFIX,
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted,
  ].join(":");
}

export function decrypt({
  encrypted,
  key,
  useCase,
}: {
  encrypted: string;
  key: string;
  useCase: EncryptionUseCase;
}): string {
  if (!encrypted.startsWith(`${ENCRYPTION_V2_PREFIX}:`)) {
    return legacyDecrypt({ encrypted, key, useCase });
  }

  const parts = encrypted.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted value format.");
  }

  const [, ivHex, authTagHex, encryptedText] = parts;
  if (
    !/^[0-9a-f]+$/i.test(ivHex) ||
    !/^[0-9a-f]+$/i.test(authTagHex) ||
    !/^[0-9a-f]*$/i.test(encryptedText) ||
    Buffer.from(ivHex, "hex").length !== AES_GCM_IV_LENGTH_BYTES ||
    Buffer.from(authTagHex, "hex").length !== 16
  ) {
    throw new Error("Invalid encrypted value format.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    saltedKey(key, useCase),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
