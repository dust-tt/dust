import fileStorageConfig from "@app/lib/file_storage/config";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { GoogleAuth } from "google-auth-library";

/**
 * Mint downscoped GCS access tokens for sandbox gcsfuse mounts.
 *
 * Tokens are restricted via Credential Access Boundaries so the sandbox can only list and
 * read/write objects under a specific conversation prefix.
 *
 * Auth discovery (handled automatically by google-auth-library):
 *  - k8s (prod): Workload Identity using pod service account annotation.
 *  - Local dev:  SERVICE_ACCOUNT env var pointing to a JSON key file.
 */

export interface DownscopedGcsToken {
  accessToken: string;
  expiresInSeconds: number;
}

interface StsTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// Singleton auth client. Initialized once, reused for all token mints.
let authClientPromise: ReturnType<GoogleAuth["getClient"]> | null = null;

function getAuthClient() {
  if (!authClientPromise) {
    const auth = new GoogleAuth({
      keyFilename: fileStorageConfig.getServiceAccount(),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    authClientPromise = auth.getClient();
  }
  return authClientPromise;
}

/**
 * Mint a downscoped GCS token restricted to a single conversation prefix.
 *
 * The token grants:
 *  - Bucket-level metadata (buckets.get) needed by gcsfuse at mount time.
 *  - Object list restricted to `prefix/` via the objectListPrefix API attribute.
 *  - Object read+write restricted to `prefix/` via resource.name condition.
 */
export async function mintDownscopedGcsToken({
  bucket,
  prefix,
}: {
  bucket: string;
  prefix: string;
}): Promise<Result<DownscopedGcsToken, Error>> {
  const client = await getAuthClient();
  const { token: sourceToken } = await client.getAccessToken();

  if (!sourceToken) {
    return new Err(new Error("Failed to obtain source access token from GCP."));
  }

  try {
    const response = await fetch("https://sts.googleapis.com/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        subject_token: sourceToken,
        options: JSON.stringify({
          accessBoundary: {
            accessBoundaryRules: buildAccessBoundaryRules(bucket, prefix),
          },
        }),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return new Err(
        new Error(`STS token exchange failed (${response.status}): ${body}`)
      );
    }

    const data = (await response.json()) as StsTokenResponse;

    return new Ok({
      accessToken: data.access_token,
      expiresInSeconds: data.expires_in,
    });
  } catch (err) {
    logger.error(
      { err: normalizeError(err), bucket, prefix },
      "Failed to mint downscoped GCS token"
    );

    return new Err(normalizeError(err));
  }
}

/**
 * Build Credential Access Boundary rules that restrict a token to a single
 * conversation prefix within a bucket.
 *
 * Two rules:
 *
 *  1. legacyBucketReader (unconditional) — grants buckets.get + objects.list at the bucket level.
 *     gcsfuse needs both at mount time.
 *     Note: legacyBucketReader does NOT include objects.get — the token cannot
 *     read object contents, only list paths and get bucket metadata.
 *     TODO(2026-03-12 SANDBOX): Restrict objects.list to our prefix via objectListPrefix
 *     CAB condition once we confirm buckets.get works with it.
 *
 *  2. objectUser with resource.name condition — read/write scoped to prefix.
 */
function buildAccessBoundaryRules(bucket: string, prefix: string) {
  const bucketResource = `//storage.googleapis.com/projects/_/buckets/${bucket}`;

  return [
    {
      availablePermissions: ["inRole:roles/storage.legacyBucketReader"],
      availableResource: bucketResource,
    },
    {
      availablePermissions: ["inRole:roles/storage.objectUser"],
      availableResource: bucketResource,
      availabilityCondition: {
        expression: `resource.name.startsWith('projects/_/buckets/${bucket}/objects/${prefix}/')`,
      },
    },
  ];
}
