import config from "@app/lib/api/config";
import fileStorageConfig from "@app/lib/file_storage/config";
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
async function getSourceToken(): Promise<Result<string, Error>> {
  try {
    const client = await getAuthClient();
    const { token } = await client.getAccessToken();
    if (!token) {
      return new Err(new Error("GCP auth returned no access token."));
    }
    return new Ok(token);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

async function exchangeToken({
  bucket,
  prefix,
  sourceToken,
}: {
  bucket: string;
  prefix: string;
  sourceToken: string;
}): Promise<Result<StsTokenResponse, Error>> {
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

    return new Ok((await response.json()) as StsTokenResponse);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

export async function mintDownscopedGcsToken({
  bucket,
  prefix,
}: {
  bucket: string;
  prefix: string;
}): Promise<Result<DownscopedGcsToken, Error>> {
  const sourceTokenResult = await getSourceToken();
  if (sourceTokenResult.isErr()) {
    return sourceTokenResult;
  }

  const stsResult = await exchangeToken({
    bucket,
    prefix,
    sourceToken: sourceTokenResult.value,
  });
  if (stsResult.isErr()) {
    return stsResult;
  }

  const data = stsResult.value;
  return new Ok({
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in,
  });
}

// Custom role created in dust-infra with only storage.buckets.get.
// No predefined role grants buckets.get without also granting objects.list, and CAB does not
// support specifying individual permissions, only roles.
const SANDBOX_STORAGE_MOUNT_ROLE_ID = "sandbox_storage_mount";

function getStorageMountRole(): string {
  return `projects/${config.getGoogleCloudProjectId()}/roles/${SANDBOX_STORAGE_MOUNT_ROLE_ID}`;
}

/**
 * Build Credential Access Boundary rules that restrict a token to a single conversation prefix
 * within a bucket.
 *
 * Three rules (evaluated with OR semantics by the STS endpoint):
 *
 *  1. Custom role (storage.buckets.get only) — unconditional.
 *     gcsfuse needs bucket metadata at mount time. Using a custom role avoids leaking objects.list
 *     which is bundled in every predefined role that includes buckets.get.
 *
 *  2. legacyBucketReader with objectListPrefix condition — grants objects.list restricted to our
 *     prefix via the objectListPrefix CAB attribute. gcsfuse must be started with
 *     --enable-hns=false to avoid the GetStorageLayout call (which requires unrestricted
 *     objects.list and would bypass this condition).
 *
 *  3. objectUser with resource.name condition — read/write scoped to prefix.
 */
function buildAccessBoundaryRules(bucket: string, prefix: string) {
  const bucketResource = `//storage.googleapis.com/projects/_/buckets/${bucket}`;

  return [
    {
      availablePermissions: [`inRole:${getStorageMountRole()}`],
      availableResource: bucketResource,
    },
    {
      availablePermissions: ["inRole:roles/storage.legacyBucketReader"],
      availableResource: bucketResource,
      availabilityCondition: {
        expression: `api.getAttribute('storage.googleapis.com/objectListPrefix', '').startsWith('${prefix}/')`,
      },
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
