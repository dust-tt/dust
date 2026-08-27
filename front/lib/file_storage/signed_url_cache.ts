import {
  DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";
import { cacheWithRedis } from "@app/lib/utils/cache";

// LLM providers may fetch a cached image URL several minutes after it was signed.
export const MODEL_INPUT_SIGNED_URL_EXPIRATION_DELAY_MS = 60 * 60 * 1000;

// Cache TTL as a fraction of the signed URL's own expiration, so a served URL still has
// real validity left instead of sitting right at its expiry.
const SIGNED_URL_CACHE_TTL_RATIO = 0.8;

export function computeSignedUrlCacheTtlMs(expirationDelayMs: number): number {
  return Math.floor(expirationDelayMs * SIGNED_URL_CACHE_TTL_RATIO);
}

const getCachedSignedUrl = cacheWithRedis(
  (gcsPath: string, expirationDelayMs: number): Promise<string> =>
    getPrivateUploadBucket().getSignedUrl(gcsPath, { expirationDelayMs }),
  (gcsPath, expirationDelayMs) => `${gcsPath}-${expirationDelayMs}`,
  {
    ttlMs: (_gcsPath, expirationDelayMs) =>
      computeSignedUrlCacheTtlMs(expirationDelayMs),
  }
);

/**
 * Cached signed URL for a private-upload GCS path. Without this, conversation rendering
 * generates a brand new URL (and expiry) on every render of every history-bearing image,
 * breaking prompt-cache prefix stability for any interaction containing one.
 */
export async function getCachedPrivateUploadSignedUrl(
  gcsPath: string,
  {
    expirationDelayMs = DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS,
  }: { expirationDelayMs?: number } = {}
): Promise<string> {
  const url = await getCachedSignedUrl(gcsPath, expirationDelayMs);
  if (url === null) {
    throw new Error(
      `Unexpected null signed URL from cache for path: ${gcsPath}`
    );
  }
  return url;
}
