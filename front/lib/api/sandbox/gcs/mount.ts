import {
  getConversationFilesBasePath,
  getProjectFilesBasePath,
} from "@app/lib/api/files/mount_path";
import { mintDownscopedGcsToken } from "@app/lib/api/sandbox/gcs/token";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { Authenticator } from "@app/lib/auth";
import fileStorageConfig from "@app/lib/file_storage/config";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { concurrentExecutor } from "@app/temporal/workflow_utils";
import type { ConversationType } from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MOUNT_TIMEOUT_MS = 30_000;

const MOUNT_POINT_CONVERSATION = "/files/conversation";
const MOUNT_POINT_PROJECT = "/files/project";

interface MountTarget {
  label: "conversation" | "project";
  mountPoint: string;
  prefix: string;
}

/**
 * Compute the set of GCS prefixes / sandbox mount points for the given conversation.
 * Always includes the conversation mount. Add the project mount when the conversation belongs to a
 * project space.
 */
function buildMountTargets(
  auth: Authenticator,
  conversation: ConversationType
): MountTarget[] {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const targets: MountTarget[] = [
    {
      label: "conversation",
      // Strip trailing slash so the prefix can be used directly in the CAB conditions and
      // gcsfuse --only-dir.
      prefix: getConversationFilesBasePath({
        workspaceId,
        conversationId: conversation.sId,
      }).replace(/\/$/, ""),
      mountPoint: MOUNT_POINT_CONVERSATION,
    },
  ];

  if (isProjectConversation(conversation)) {
    targets.push({
      label: "project",
      prefix: getProjectFilesBasePath({
        workspaceId,
        projectId: conversation.spaceId,
      }).replace(/\/$/, ""),
      mountPoint: MOUNT_POINT_PROJECT,
    });
  }

  return targets;
}

/**
 * Mount GCS files into a running sandbox via gcsfuse.
 *
 * Always mounts the conversation prefix at /files/conversation. When the conversation belongs to
 * a project, also mounts the project prefix at /files/project. Both gcsfuse processes share the
 * same token server on :9876, fed by a single multi-prefix downscoped token.
 *
 * The mount sequence:
 *  1. Mint a downscoped token covering every prefix.
 *  2. Write the token JSON to /tmp/token.json in the sandbox.
 *  3. Start the token HTTP server (netcat loop on :9876) and wait for it.
 *  4. Run one gcsfuse process per mount target.
 *
 * Transactional: any mount failure returns Err. We do not partially mount.
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

  const targets = buildMountTargets(auth, conversation);

  const childLogger = logger.child({
    sandboxId: sandbox.sId,
    workspaceId,
    conversationId: conversation.sId,
    bucket,
    prefixes: targets.map((t) => t.prefix),
  });

  // 1. Mint downscoped token covering every prefix.
  const tokenResult = await mintDownscopedGcsToken({
    bucket,
    prefixes: targets.map((t) => t.prefix),
  });
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

  // 4. Mount each target via gcsfuse (runs as root for FUSE permissions).
  const mountResults = await concurrentExecutor(
    targets,
    async (target) => {
      const mountCmd = buildMountCommand({ bucket, ...target });
      const mountResult = await sandbox.exec(auth, mountCmd, {
        timeoutMs: MOUNT_TIMEOUT_MS,
        user: "root",
      });

      if (mountResult.isErr()) {
        childLogger.error(
          { err: mountResult.error, mountPoint: target.mountPoint },
          "GCS mount: gcsfuse mount failed"
        );
        return mountResult;
      }

      if (mountResult.value.exitCode !== 0) {
        const msg = `gcsfuse exited with code ${mountResult.value.exitCode} for ${target.mountPoint}: ${mountResult.value.stderr}`;
        childLogger.error(
          { stderr: mountResult.value.stderr, mountPoint: target.mountPoint },
          msg
        );

        return new Err(new Error(msg));
      }

      return new Ok("");
    },
    { concurrency: targets.length }
  );

  const errors = mountResults.filter((r) => r.isErr());
  if (errors.length > 0) {
    childLogger.info({ errors }, "GCS mount: files mounted failed");

    return errors[0];
  }

  childLogger.info(
    { mountPoints: targets.map((t) => t.mountPoint) },
    "GCS mount: files mounted successfully"
  );

  return new Ok(undefined);
}

/**
 * Refresh the GCS token in an already-mounted sandbox.
 *
 * Overwrites /tmp/token.json. The token server picks it up on next request from gcsfuse.
 * No remount needed. The token covers every prefix the sandbox was originally mounted with.
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

  const targets = buildMountTargets(auth, conversation);

  const tokenResult = await mintDownscopedGcsToken({
    bucket,
    prefixes: targets.map((t) => t.prefix),
  });
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
      prefixes: targets.map((t) => t.prefix),
    },
    "GCS token refreshed"
  );

  return new Ok(undefined);
}

function buildMountCommand({
  bucket,
  prefix,
  mountPoint,
}: {
  bucket: string;
  prefix: string;
  mountPoint: string;
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

  return `timeout 30 gcsfuse ${flags} ${bucket} ${mountPoint} 2>&1`;
}

function escapeSingleQuotes(s: string): string {
  return s.replace(/'/g, "'\\''");
}
