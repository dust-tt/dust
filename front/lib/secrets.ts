import config from "@app/lib/api/config";

export async function encryptSecretValue({
  value,
}: {
  value: string;
}): Promise<string> {
  const key = config.getDustDeveloperSecretsSecret()
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export async function decryptSecretValue({
  value,
}: {
  value: string;
}): Promise<string> {
  const key = config.getDustDeveloperSecretsSecret()
  const [iv, encrypted] = value.split(":").map((v) => Buffer.from(v, "hex"));
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}