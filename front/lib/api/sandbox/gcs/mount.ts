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
const TOKEN_SERVER_PORT = 9876;
const TOKEN_SERVER_URL = `http://127.0.0.1:${TOKEN_SERVER_PORT}`;

/**
 * Ensure GCS conversation files are mounted in the sandbox and the token
 * server is running. Idempotent: safe to call on a fresh sandbox, on one
 * that woke from a snapshot with the mount preserved, or on a long-running
 * sandbox that just needs a token refresh.
 *
 * Hot path is one sandbox exec (the STS mint always happens regardless):
 * probe `/files/conversation` and the token server, and if both look good,
 * refresh the token in place. Cold path adds one more exec to lazy-unmount
 * any stale mount and run gcsfuse.
 */
export async function ensureConversationFilesMounted(
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

  const tokenJson = JSON.stringify({
    access_token: tokenResult.value.accessToken,
    token_type: "Bearer",
    expires_in: tokenResult.value.expiresInSeconds,
  });

  const agentResult = await sandbox.exec(
    auth,
    buildProbeAndSetupScript({ tokenJson })
  );
  if (agentResult.isErr()) {
    childLogger.error(
      { err: agentResult.error },
      "GCS mount: probe/setup exec failed"
    );
    return agentResult;
  }
  if (agentResult.value.exitCode !== 0) {
    const msg = `GCS mount: probe/setup failed: ${agentResult.value.stderr}`;
    childLogger.error({ stderr: agentResult.value.stderr }, msg);
    return new Err(new Error(msg));
  }

  if (agentResult.value.stdout.includes("READY")) {
    return new Ok(undefined);
  }

  // Cold path: lazy-unmount any stale entry (no-op if nothing's there) and
  // mount via gcsfuse. fusermount and gcsfuse both require root.
  const mountResult = await sandbox.exec(
    auth,
    buildUnmountAndMountScript({ bucket, prefix }),
    {
      timeoutMs: MOUNT_TIMEOUT_MS,
      user: "root",
    }
  );
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
 * Probe the mount + token server. If both look good, refresh the token
 * in place and emit READY. Otherwise rebuild the local prereqs (kill any
 * stale token server, rewrite the token, restart the server, verify it
 * is listening) and emit NEEDS_MOUNT — caller takes the cold path.
 *
 * The mount probe needs both `mountpoint -q` (kernel entry) AND a `stat`:
 * the kernel can show a path as mounted even when the gcsfuse daemon is
 * dead, in which case `stat` returns EIO. The token-server check has to
 * retry briefly: token-server.sh is a `while true; do nc -l -p 9876 -q 1`
 * loop, so after every served request there's a window (up to ~1s) where
 * no listener is bound and a single curl will fail. We retry up to 5x
 * 100ms on the hot-path probe so we don't false-negative into an
 * unnecessary remount, and up to 10x100ms on the cold-path startup so
 * we catch a fresh launch quickly without losing a wake-up race.
 *
 * No `set -e` on purpose: the probe chain is meant to fall through on
 * failure to the rebuild branch. We use explicit `exit 1` for the only
 * fatal case.
 */
export function buildProbeAndSetupScript({
  tokenJson,
}: {
  tokenJson: string;
}): string {
  const escapedTokenJson = escapeSingleQuotes(tokenJson);
  return `set -u
token_server_alive() {
  for _ in 1 2 3 4 5; do
    if curl -sf ${TOKEN_SERVER_URL} >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}
if mountpoint -q ${MOUNT_POINT} 2>/dev/null \\
   && timeout 1 stat ${MOUNT_POINT} >/dev/null 2>&1 \\
   && token_server_alive; then
  printf '%s' '${escapedTokenJson}' > /tmp/token.json
  echo READY
else
  # fuser -k targets the listener by port, not by process name. Avoids
  # the trap of pkill -f matching the current shell's own argv (which
  # carries the entire script source, including "token-server.sh").
  fuser -k ${TOKEN_SERVER_PORT}/tcp 2>/dev/null || true
  printf '%s' '${escapedTokenJson}' > /tmp/token.json
  bash /home/agent/.bin/token-server.sh > /tmp/server.log 2>&1 &
  ready=0
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 0.1
    if curl -sf ${TOKEN_SERVER_URL} >/dev/null 2>&1; then
      ready=1
      break
    fi
  done
  if [ "$ready" -ne 1 ]; then
    echo "token server did not become ready" >&2
    exit 1
  fi
  echo NEEDS_MOUNT
fi`;
}

export function buildUnmountAndMountScript({
  bucket,
  prefix,
}: {
  bucket: string;
  prefix: string;
}): string {
  return `fusermount -u -z ${MOUNT_POINT} 2>/dev/null || true
${buildMountCommand({ bucket, prefix })}`;
}

function buildMountCommand({
  bucket,
  prefix,
}: {
  bucket: string;
  prefix: string;
}): string {
  const flags = [
    `--token-url ${TOKEN_SERVER_URL}`,
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
