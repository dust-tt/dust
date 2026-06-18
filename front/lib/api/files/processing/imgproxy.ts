import config from "@app/lib/api/config";
import crypto from "crypto";

interface BuildImgproxyUrlParams {
  sourceUrl: string;
  maxSizePixels: number;
  extension: string;
}

export function buildImgproxyUrl({
  sourceUrl,
  maxSizePixels,
  extension,
}: BuildImgproxyUrlParams): string {
  const key = Buffer.from(config.getImgproxyKey(), "hex");
  const salt = Buffer.from(config.getImgproxySalt(), "hex");

  const encodedSource = Buffer.from(sourceUrl).toString("base64url");
  const path = `/rs:fit:${maxSizePixels}:${maxSizePixels}:0/${encodedSource}.${extension}`;

  const signature = crypto
    .createHmac("sha256", key)
    .update(salt)
    .update(path)
    .digest("base64url");

  return `${config.getImgproxyUrl()}/${signature}${path}`;
}
