import crypto from "crypto";

export function md5(str: string): string {
  return crypto.createHash("md5").update(str).digest("hex");
}

export function encrypt(text: string, key: string): string {
  const cipher = crypto.createCipheriv("aes-256-cbc", key, key);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

export function decrypt(encrypted: string, key: string): string {
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, key);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}