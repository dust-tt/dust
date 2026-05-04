import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import { mintDownscopedGcsToken } from "@app/lib/api/sandbox/gcs/token";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { Authenticator } from "@app/lib/auth";
import fileStorageConfig from "@app/lib/file_storage/config";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MOUNT_TIMEOUT_MS = 35_000;
const MOUNT_POINT = "/files/conversation";
const TOKEN_FILE = "/tmp/token.json";
const TOKEN_SERVER_READY_TIMEOUT_SECONDS = 5;

/**
 * Mount GCS conversation files into a running sandbox via gcsfuse.
 *
 * The mount sequence:
 *  1. Mint a downscoped token scoped to the conversation prefix.
 *  2. In a single sandbox exec: write token, start token server, poll until
 *     it's listening, then run gcsfuse. Bundling avoids ~3 E2B exec
 *     round-trips (~270 ms each) plus the previous hardcoded `sleep 1`.
 *
 * The bundled script runs as root because gcsfuse needs root for FUSE.
 * /tmp/token.json is chmod'd 666 so refreshGcsToken (default user) can
 * overwrite it later.
 */
export async function mountConversationFiles(
  auth: Authenticator,
  sandbox: SandboxResource,
  conversation: ConversationType,
  image: SandboxImage
): Promise<Result<void, Error>> {
  if (!image.hasCapability("gcsfuse")) {
    return new Ok(undefined);
  }

  const bucket = fileStorageConfig.getGcsPrivateUploadsBucket();

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const prefix = getConversationFilesBasePath({
    workspaceId,
    conversationId: conversation.sId,
  }).replace(/\/$/, ""); // Strip trailing slash for the token condition.

  const childLogger = logger.child({
    sandboxId: sandbox.sId,
    workspaceId,
    conversationId: conversation.sId,
    bucket,
    prefix,
  });

  const tokenResult = await mintDownscopedGcsToken({ bucket, prefix });
  if (tokenResult.isErr()) {
    childLogger.error(
      { err: tokenResult.error },
      "GCS mount: failed to mint token"
    );
    return tokenResult;
  }

  const { accessToken, expiresInSeconds } = tokenResult.value;

  const tokenJson = JSON.stringify({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresInSeconds,
  });

  const mountScript = buildMountScript({ tokenJson, bucket, prefix });
  const mountResult = await sandbox.exec(auth, mountScript, {
    timeoutMs: MOUNT_TIMEOUT_MS,
    user: "root",
  });
  if (mountResult.isErr()) {
    childLogger.error(
      { err: mountResult.error },
      "GCS mount: exec failed"
    );
    return mountResult;
  }

  if (mountResult.value.exitCode !== 0) {
    const msg = `GCS mount script exited with code ${mountResult.value.exitCode}: ${mountResult.value.stderr}`;
    childLogger.error(
      {
        exitCode: mountResult.value.exitCode,
        stderr: mountResult.value.stderr,
      },
      msg
    );
    return new Err(new Error(msg));
  }

  childLogger.info({}, "GCS mount: conversation files mounted successfully");
  return new Ok(undefined);
}

/**
 * Refresh the GCS token in an already-mounted sandbox.
 *
 * Overwrites /tmp/token.json. The token server picks it up on next request from gcsfuse.
 * No remount needed.
 */
export async function refreshGcsToken(
  auth: Authenticator,
  sandbox: SandboxResource,
  conversation: ConversationType,
  image: SandboxImage
): Promise<Result<void, Error>> {
  if (!image.hasCapability("gcsfuse")) {
    return new Ok(undefined);
  }

  const bucket = fileStorageConfig.getGcsPrivateUploadsBucket();

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const prefix = getConversationFilesBasePath({
    workspaceId,
    conversationId: conversation.sId,
  }).replace(/\/$/, "");

  const tokenResult = await mintDownscopedGcsToken({ bucket, prefix });
  if (tokenResult.isErr()) {
    return tokenResult;
  }

  const tokenJson = JSON.stringify({
    access_token: tokenResult.value.accessToken,
    token_type: "Bearer",
    expires_in: tokenResult.value.expiresInSeconds,
  });

  const writeResult = await sandbox.exec(
    auth,
    `printf '%s' '${escapeSingleQuotes(tokenJson)}' > /tmp/token.json`
  );
  if (writeResult.isErr()) {
    return writeResult;
  }

  logger.info(
    {
      sandboxId: sandbox.sId,
      workspaceId,
      conversationId: conversation.sId,
    },
    "GCS token refreshed"
  );

  return new Ok(undefined);
}

function buildMountScript({
  tokenJson,
  bucket,
  prefix,
}: {
  tokenJson: string;
  bucket: string;
  prefix: string;
}): string {
  const flags = [
    `--token-url http://127.0.0.1:9876`,
    // Disable token caching so gcsfuse fetches fresh token from server on every GCS API request.
    // This ensures gcsfuse never uses stale credentials, eliminating 401 errors after token expiry.
    `--reuse-token-from-url=false`,
    `--only-dir ${prefix}`,
    `--implicit-dirs`,
    `-o allow_other`,
    `--file-mode=666`,
    `--dir-mode=777`,
    `--kernel-list-cache-ttl-secs=60`,
    // Disable HNS (Hierarchical Namespace) support. gcsfuse calls GetStorageLayout at mount time
    // when HNS is enabled, which requires unrestricted `objects.list` on the bucket. Disabling it
    // lets us condition `objects.list` via the objectListPrefix CAB attribute.
    `--enable-hns=false`,
  ].join(" ");

  // chmod 666 so refreshGcsToken (default user) can overwrite the file later.
  return `set -e
printf '%s' '${escapeSingleQuotes(tokenJson)}' > ${TOKEN_FILE}
chmod 666 ${TOKEN_FILE}
bash /home/agent/.bin/token-server.sh > /tmp/server.log 2>&1 &
deadline=$(( $(date +%s) + ${TOKEN_SERVER_READY_TIMEOUT_SECONDS} ))
while true; do
  if curl -sf http://127.0.0.1:9876 > /dev/null 2>&1; then
    break
  fi
  if [ $(date +%s) -ge $deadline ]; then
    echo "Token server not ready after ${TOKEN_SERVER_READY_TIMEOUT_SECONDS}s" >&2
    exit 41
  fi
  sleep 0.05
done
timeout 30 gcsfuse ${flags} ${bucket} ${MOUNT_POINT} 2>&1`;
}

function escapeSingleQuotes(s: string): string {
  return s.replace(/'/g, "'\\''");
}
