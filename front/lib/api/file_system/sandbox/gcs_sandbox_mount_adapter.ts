import {
  buildAccessBoundaryRules,
  mintDownscopedGcsToken,
} from "@app/lib/api/sandbox/gcs/token";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { concurrentExecutor } from "@app/temporal/workflow_utils";

import type { SandboxMountAdapter } from "./sandbox_mount_adapter";

const MOUNT_TIMEOUT_MS = 30_000;

export type GCSMountTarget = {
  /**
   * GCS object prefix, no trailing slash, e.g. `w/{wId}/conversations/{cId}/files`.
   * Used in CAB conditions and as the `gcsfuse --only-dir` argument.
   */
  gcsPrefix: string;
  sandboxMountPoint: string;
  /**
   * When set, a symlink is created from this path to `sandboxMountPoint` after mounting
   * so that old hardcoded paths (`/files/conversation`, `/files/project`) keep working.
   */
  legacySandboxMountPoint: string | null;
};

/**
 * GCS-specific SandboxMountAdapter.
 *
 * Mounts one GCS prefix per target via gcsfuse using a CAB-scoped downscoped token
 * served by a lightweight HTTP token server baked into the sandbox image.
 *
 * Token budget: 1 unconditional rule + 2 rules per prefix, max 10 CAB rules total,
 * so at most 4 targets are supported.
 */
export class GCSSandboxMountAdapter implements SandboxMountAdapter {
  constructor(
    private readonly bucket: string,
    private readonly targets: ReadonlyArray<GCSMountTarget>
  ) {
    if (targets.length > 4) {
      throw new Error(
        `GCSSandboxMountAdapter: too many targets (${targets.length}), CAB rule limit is 4.`
      );
    }
  }

  async setup(
    auth: Authenticator,
    sandbox: SandboxResource,
    image: SandboxImage
  ): Promise<Result<void, Error>> {
    if (!image.hasCapability("gcsfuse")) {
      return new Ok(undefined);
    }

    const { bucket, targets } = this;
    const prefixes = targets.map((t) => t.gcsPrefix);
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const childLogger = logger.child({ sandboxId: sandbox.sId, workspaceId, bucket, prefixes });

    // 1. Mint a CAB-scoped token covering every prefix.
    const tokenResult = await mintDownscopedGcsToken({ bucket, prefixes });
    if (tokenResult.isErr()) {
      childLogger.error({ err: tokenResult.error }, "GCS sandbox mount: failed to mint token");
      return tokenResult;
    }

    // 2. Write token file into the sandbox.
    const tokenJson = buildTokenJson(tokenResult.value);
    const writeResult = await sandbox.exec(
      auth,
      `printf '%s' '${escapeSingleQuotes(tokenJson)}' > /tmp/token.json`
    );
    if (writeResult.isErr()) {
      childLogger.error({ err: writeResult.error }, "GCS sandbox mount: failed to write token file");
      return writeResult;
    }

    // 3. Start the token HTTP server (baked into the image at token-server.sh) and wait for :9876.
    const startResult = await sandbox.exec(
      auth,
      "bash /home/agent/.bin/token-server.sh > /tmp/server.log 2>&1 &"
    );
    if (startResult.isErr()) {
      childLogger.error({ err: startResult.error }, "GCS sandbox mount: failed to start token server");
      return startResult;
    }

    const checkResult = await sandbox.exec(
      auth,
      "sleep 1 && curl -sf http://127.0.0.1:9876 > /dev/null 2>&1"
    );
    if (checkResult.isErr() || checkResult.value.exitCode !== 0) {
      const msg = "GCS token server not ready after 1s";
      childLogger.error({}, msg);
      return new Err(new Error(msg));
    }

    // 4. Create mount directories and run gcsfuse concurrently for each target.
    const mountResults = await concurrentExecutor(
      [...targets],
      async (target) => {
        const mkdirResult = await sandbox.exec(
          auth,
          `mkdir -p ${target.sandboxMountPoint}`,
          { user: "root" }
        );
        if (mkdirResult.isErr()) {
          return mkdirResult;
        }

        const mountResult = await sandbox.exec(
          auth,
          buildMountCommand({ bucket, prefix: target.gcsPrefix, mountPoint: target.sandboxMountPoint }),
          { timeoutMs: MOUNT_TIMEOUT_MS, user: "root" }
        );

        if (mountResult.isErr()) {
          childLogger.error(
            { err: mountResult.error, mountPoint: target.sandboxMountPoint },
            "GCS sandbox mount: gcsfuse failed"
          );
          return mountResult;
        }

        if (mountResult.value.exitCode !== 0) {
          const msg = `gcsfuse exited with code ${mountResult.value.exitCode} for ${target.sandboxMountPoint}: ${mountResult.value.stderr}`;
          childLogger.error({ stderr: mountResult.value.stderr, mountPoint: target.sandboxMountPoint }, msg);
          return new Err(new Error(msg));
        }

        // 5. Backward-compat symlink so old paths keep working.
        if (target.legacySandboxMountPoint) {
          const symlinkResult = await sandbox.exec(
            auth,
            `ln -sfn ${target.sandboxMountPoint} ${target.legacySandboxMountPoint}`,
            { user: "root" }
          );
          if (symlinkResult.isErr()) {
            // Non-fatal: canonical path works, old code hitting the legacy path will just fail.
            childLogger.warn(
              { err: symlinkResult.error, legacyMountPoint: target.legacySandboxMountPoint },
              "GCS sandbox mount: legacy symlink failed (non-fatal)"
            );
          }
        }

        return new Ok(undefined);
      },
      { concurrency: targets.length }
    );

    const firstError = mountResults.find((r) => r.isErr());
    if (firstError) {
      childLogger.error({}, "GCS sandbox mount: one or more targets failed");
      return firstError;
    }

    childLogger.info(
      { mountPoints: targets.map((t) => t.sandboxMountPoint) },
      "GCS sandbox mount: all targets mounted successfully"
    );

    return new Ok(undefined);
  }

  async refreshCredential(
    auth: Authenticator,
    sandbox: SandboxResource,
    image: SandboxImage
  ): Promise<Result<void, Error>> {
    if (!image.hasCapability("gcsfuse")) {
      return new Ok(undefined);
    }

    const prefixes = this.targets.map((t) => t.gcsPrefix);
    const tokenResult = await mintDownscopedGcsToken({ bucket: this.bucket, prefixes });
    if (tokenResult.isErr()) {
      return tokenResult;
    }

    const writeResult = await sandbox.exec(
      auth,
      `printf '%s' '${escapeSingleQuotes(buildTokenJson(tokenResult.value))}' > /tmp/token.json`
    );
    if (writeResult.isErr()) {
      return writeResult;
    }

    logger.info(
      { sandboxId: sandbox.sId, workspaceId: auth.getNonNullableWorkspace().sId, prefixes },
      "GCS sandbox mount: credential refreshed"
    );

    return new Ok(undefined);
  }

  /** Exposed for testing and diagnostics. */
  getAccessBoundaryRules() {
    return buildAccessBoundaryRules(this.bucket, this.targets.map((t) => t.gcsPrefix));
  }
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
    "--token-url http://127.0.0.1:9876",
    // Disable token caching so gcsfuse fetches a fresh credential on every GCS API request.
    "--reuse-token-from-url=false",
    `--only-dir ${prefix}`,
    "--implicit-dirs",
    "-o allow_other",
    "--file-mode=666",
    "--dir-mode=777",
    "--kernel-list-cache-ttl-secs=60",
    // Disable HNS: GetStorageLayout requires unrestricted objects.list which CAB cannot grant
    // per-prefix. With HNS disabled we scope list access via objectListPrefix conditions.
    "--enable-hns=false",
  ].join(" ");

  return `timeout 30 gcsfuse ${flags} ${bucket} ${mountPoint} 2>&1`;
}

function buildTokenJson({
  accessToken,
  expiresInSeconds,
}: {
  accessToken: string;
  expiresInSeconds: number;
}): string {
  return JSON.stringify({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresInSeconds,
  });
}

function escapeSingleQuotes(s: string): string {
  return s.replace(/'/g, "'\\''");
}
