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

export function encrypt({
  text,
  key,
  useCase,
}: {
  text: string;
  key: string;
  useCase: EncryptionUseCase;
}): string {
  const iv = md5(key).substring(0, 16);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    saltedKey(key, useCase),
    iv
  );
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
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
  const iv = md5(key).substring(0, 16);
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    saltedKey(key, useCase),
    iv
  );
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
