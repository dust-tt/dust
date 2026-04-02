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

const MOUNT_TIMEOUT_MS = 30_000;
const MOUNT_POINT = "/files/conversation";

/**
 * Mount GCS conversation files into a running sandbox via gcsfuse.
 *
 * The mount sequence:
 *  1. Mint a downscoped token scoped to the conversation prefix.
 *  2. Write the token JSON to /tmp/token.json in the sandbox.
 *  3. Start the token HTTP server (netcat loop on :9876) and wait for it.
 *  4. Run gcsfuse with --token-url pointing to the local token server.
 *
 * This function is designed to be called fire-and-forget (non-blocking) after sandbox creation or
 * wake. The .mount-pending sentinel file signals to code running in the sandbox that the mount is
 * not yet ready.
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

  // 1. Mint downscoped token.
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

  // 2. Write token file into the sandbox.
  const writeResult = await sandbox.exec(
    auth,
    `printf '%s' '${escapeSingleQuotes(tokenJson)}' > /tmp/token.json`
  );
  if (writeResult.isErr()) {
    childLogger.error(
      { err: writeResult.error },
      "GCS mount: failed to write token file"
    );
    return writeResult;
  }

  // 3. Start token server and wait until it's listening.
  // The server script is a netcat loop baked into the template.
  // Start in background, then verify with a separate exec (matching PoC).
  const startResult = await sandbox.exec(
    auth,
    "bash /home/agent/.bin/token-server.sh > /tmp/server.log 2>&1 &"
  );
  if (startResult.isErr()) {
    childLogger.error(
      { err: startResult.error },
      "GCS mount: failed to start token server"
    );
    return startResult;
  }

  const checkResult = await sandbox.exec(
    auth,
    "sleep 1 && curl -sf http://127.0.0.1:9876 > /dev/null 2>&1"
  );
  if (checkResult.isErr() || checkResult.value.exitCode !== 0) {
    const msg = "Token server not ready after 1s";
    childLogger.error({}, msg);
    return new Err(new Error(msg));
  }

  // 4. Mount via gcsfuse (runs as root for FUSE permissions).
  const mountCmd = buildMountCommand({ bucket, prefix });
  const mountResult = await sandbox.exec(auth, mountCmd, {
    timeoutMs: MOUNT_TIMEOUT_MS,
    user: "root",
  });
  if (mountResult.isErr()) {
    childLogger.error(
      { err: mountResult.error },
      "GCS mount: gcsfuse mount failed"
    );
    return mountResult;
  }

  if (mountResult.value.exitCode !== 0) {
    const msg = `gcsfuse exited with code ${mountResult.value.exitCode}: ${mountResult.value.stderr}`;
    childLogger.error({ stderr: mountResult.value.stderr }, msg);
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

function buildMountCommand({
  bucket,
  prefix,
}: {
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

  return `timeout 30 gcsfuse ${flags} ${bucket} ${MOUNT_POINT} 2>&1`;
}

function escapeSingleQuotes(s: string): string {
  return s.replace(/'/g, "'\\''");
}
