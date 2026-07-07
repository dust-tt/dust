import {
  buildAccessBoundaryRules,
  mintDownscopedGcsToken,
} from "@app/lib/api/sandbox/gcs/token";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import {
  type RootCommand,
  rootCommand,
} from "@app/lib/api/sandbox/root_command";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { concurrentExecutor } from "@app/temporal/workflow_utils";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

import type { SandboxMountAdapter } from "./sandbox_mount_adapter";

const MOUNT_TIMEOUT_MS = 30_000;

const TOKEN_SERVER_URL = "http://127.0.0.1:9876";
const TOKEN_SERVER_POLL_ATTEMPTS = 100;
const TOKEN_SERVER_POLL_INTERVAL_SECONDS = 0.05;
const TOKEN_SERVER_EXEC_TIMEOUT_MS = 10_000;

/**
 * Per-target mount profile.
 *
 * - "workload": root-mounted with `allow_other` so the unprivileged sandbox
 *   users can access it; permissive file/dir modes; 60s kernel list cache
 *   (read-mostly workloads). All agent-facing mounts.
 * - "pod_state_replica": mounted AS `dust-state` (via runuser) so the FUSE
 *   default — only the mounting user can access the fs — makes it invisible to
 *   every other uid, including the untrusted workload uid 1003 and root. No
 *   `allow_other`, restrictive modes, and NO kernel list caching: litestream
 *   restore must never see a stale LTX listing. Requires the image's
 *   `pod_state` capability (dust-state user + /pod-state layout).
 */
export type GCSMountProfile = "workload" | "pod_state_replica";

export type GCSMountTarget = {
  /**
   * GCS object prefix, no trailing slash, e.g. `w/{wId}/conversations/{cId}/files`.
   * Used in CAB conditions and as the `gcsfuse --only-dir` argument.
   */
  gcsPrefix: string;
  sandboxMountPoint: string;
  /**
   * When set, a symlink is created from this path to `sandboxMountPoint` after mounting
   * so that old hardcoded paths (`/files/conversation`, `/files/pod`) keep working.
   */
  legacySandboxMountPoint: string | null;
  /** When set, the mount uses `-o ro` and a read-only-scoped token (see buildAccessBoundaryRules). */
  readOnly: boolean;
  mountProfile: GCSMountProfile;
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

    const { bucket } = this;
    const targets = this.activeTargets(image);
    const prefixes = targets.map((t) => t.gcsPrefix);
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const childLogger = logger.child({
      sandboxId: sandbox.sId,
      workspaceId,
      bucket,
      prefixes,
    });

    // 1. Mint a CAB-scoped token covering every prefix, read-only where the target is.
    const tokenResult = await mintDownscopedGcsToken({
      bucket,
      prefixes: targets.map((t) => ({
        prefix: t.gcsPrefix,
        readOnly: t.readOnly,
      })),
    });
    if (tokenResult.isErr()) {
      childLogger.error(
        { err: tokenResult.error },
        "GCS sandbox mount: failed to mint token"
      );
      return tokenResult;
    }

    // 2-3. Write the token file, start the token server, and poll it ready in
    // ONE exec. Polling every 50ms returns the instant the server is listening
    // instead of a flat sleep 1, and folds three round-trips into one.
    const tokenJson = buildTokenJson(tokenResult.value);
    const tokenServerResult = await sandbox.exec(
      auth,
      `printf '%s' '${escapeSingleQuotes(tokenJson)}' > /tmp/token.json; ` +
        "nohup bash /home/agent/.bin/token-server.sh > /tmp/server.log 2>&1 & " +
        `i=0; while [ $i -lt ${TOKEN_SERVER_POLL_ATTEMPTS} ]; do ` +
        `curl -sf ${TOKEN_SERVER_URL} > /dev/null 2>&1 && exit 0; ` +
        `sleep ${TOKEN_SERVER_POLL_INTERVAL_SECONDS}; i=$((i+1)); ` +
        "done; exit 1",
      { timeoutMs: TOKEN_SERVER_EXEC_TIMEOUT_MS }
    );
    if (tokenServerResult.isErr()) {
      childLogger.error(
        { err: tokenServerResult.error },
        "GCS sandbox mount: token server exec failed"
      );
      return tokenServerResult;
    }
    if (tokenServerResult.value.exitCode !== 0) {
      const msg = "GCS token server not ready in time";
      childLogger.error(
        {
          stdout: tokenServerResult.value.stdout,
          stderr: tokenServerResult.value.stderr,
        },
        msg
      );
      return new Err(new Error(msg));
    }

    // 4. Create mount directories and run gcsfuse concurrently for each target.
    const mountResults = await concurrentExecutor(
      [...targets],
      async (target) => {
        const mkdirResult = await sandbox.execRoot(
          auth,
          rootCommand.exec("/usr/bin/mkdir", ["-p", target.sandboxMountPoint])
        );
        if (mkdirResult.isErr()) {
          return mkdirResult;
        }

        const mountResult = await sandbox.execRoot(
          auth,
          buildMountCommand({ bucket, target }),
          { timeoutMs: MOUNT_TIMEOUT_MS }
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
          childLogger.error(
            {
              stderr: mountResult.value.stderr,
              mountPoint: target.sandboxMountPoint,
            },
            msg
          );
          return new Err(new Error(msg));
        }

        // 5. Backward-compat symlink so old paths keep working.
        if (target.legacySandboxMountPoint) {
          const symlinkResult = await sandbox.execRoot(
            auth,
            rootCommand.exec("/usr/bin/ln", [
              "-sfn",
              target.sandboxMountPoint,
              target.legacySandboxMountPoint,
            ])
          );
          if (symlinkResult.isErr()) {
            // Non-fatal: canonical path works, old code hitting the legacy path will just fail.
            childLogger.warn(
              {
                err: symlinkResult.error,
                legacyMountPoint: target.legacySandboxMountPoint,
              },
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

    const targets = this.activeTargets(image);
    const tokenResult = await mintDownscopedGcsToken({
      bucket: this.bucket,
      prefixes: targets.map((t) => ({
        prefix: t.gcsPrefix,
        readOnly: t.readOnly,
      })),
    });
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
      {
        sandboxId: sandbox.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
        prefixes: targets.map((t) => t.gcsPrefix),
      },
      "GCS sandbox mount: credential refreshed"
    );

    return new Ok(undefined);
  }

  /**
   * Targets applicable to the given image. pod_state_replica targets need the
   * dust-state user and the /pod-state layout, both introduced with the
   * `pod_state` capability — on older images they are skipped entirely (no
   * mount, no CAB rules) so existing sandboxes keep working untouched.
   */
  private activeTargets(image: SandboxImage): GCSMountTarget[] {
    if (image.hasCapability("pod_state")) {
      return [...this.targets];
    }
    return this.targets.filter(
      (target) => target.mountProfile !== "pod_state_replica"
    );
  }

  /** Exposed for testing and diagnostics. */
  getAccessBoundaryRules() {
    return buildAccessBoundaryRules(
      this.bucket,
      this.targets.map((t) => ({ prefix: t.gcsPrefix, readOnly: t.readOnly }))
    );
  }
}

/** Exported for testing. */
export function buildMountCommand({
  bucket,
  target,
}: {
  bucket: string;
  target: GCSMountTarget;
}): RootCommand {
  const { gcsPrefix: prefix, sandboxMountPoint: mountPoint } = target;

  const commonFlags = [
    "--token-url",
    TOKEN_SERVER_URL,
    // Disable token caching so gcsfuse fetches a fresh credential on every GCS API request.
    "--reuse-token-from-url=false",
    "--only-dir",
    prefix,
    "--implicit-dirs",
    // Disable HNS: GetStorageLayout requires unrestricted objects.list which CAB cannot grant
    // per-prefix. With HNS disabled we scope list access via objectListPrefix conditions.
    "--enable-hns=false",
  ];

  switch (target.mountProfile) {
    case "workload": {
      // allow_other lets the unprivileged sandbox user read the root-mounted fs. `ro` is only
      // defense-in-depth: the real write protection is the read-only token scope (see
      // buildAccessBoundaryRules), not this flag.
      const mountOptions = ["allow_other"];
      if (target.readOnly) {
        mountOptions.push("ro");
      }

      const flags = [
        ...commonFlags,
        "-o",
        mountOptions.join(","),
        "--file-mode=666",
        "--dir-mode=777",
        "--kernel-list-cache-ttl-secs=60",
      ];

      return rootCommand.stderrToStdout(
        rootCommand.timeout(
          rootCommand.exec("/usr/bin/gcsfuse", [...flags, bucket, mountPoint]),
          MOUNT_TIMEOUT_MS / 1_000
        )
      );
    }

    case "pod_state_replica": {
      // Mounted AS dust-state (runuser): with no allow_other, the FUSE layer
      // denies every uid but the mounting one — the kernel-enforced version of
      // "invisible to uid 1003". List caching is OFF: litestream restore reads
      // the LTX listing at cold start and must never see a cached view.
      const flags = [
        ...commonFlags,
        "--file-mode=600",
        "--dir-mode=700",
        "--kernel-list-cache-ttl-secs=0",
      ];

      return rootCommand.stderrToStdout(
        rootCommand.timeout(
          rootCommand.exec("/usr/sbin/runuser", [
            "-u",
            "dust-state",
            "--",
            "/usr/bin/gcsfuse",
            ...flags,
            bucket,
            mountPoint,
          ]),
          MOUNT_TIMEOUT_MS / 1_000
        )
      );
    }

    default:
      assertNever(target.mountProfile);
  }
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
