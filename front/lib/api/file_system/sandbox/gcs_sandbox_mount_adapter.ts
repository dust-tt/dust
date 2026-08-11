import config from "@app/lib/api/config";
import { generateSandboxFileSystemToken } from "@app/lib/api/sandbox/access_tokens";
import {
  buildAccessBoundaryRules,
  mintDownscopedGcsToken,
} from "@app/lib/api/sandbox/gcs/token";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import { traceSandboxStartupPhase } from "@app/lib/api/sandbox/instrumentation";
import type { RootCommand } from "@app/lib/api/sandbox/root_command";
import { rootCommand } from "@app/lib/api/sandbox/root_command";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { concurrentExecutor } from "@app/temporal/workflow_utils";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

import type { SandboxMountAdapter } from "./sandbox_mount_adapter";

const MOUNT_TIMEOUT_MS = 30_000;

const TOKEN_SERVER_URL = "http://127.0.0.1:987";
const TOKEN_SERVER_PATH_PREFIX = `${TOKEN_SERVER_URL}/token`;
const TOKEN_SERVER_HEALTH_URL = `${TOKEN_SERVER_URL}/healthz`;
const TOKEN_DIRECTORY = "/run/dust-gcs";
const TOKEN_SERVER_PATH = "/usr/local/bin/dust-gcs-token-server.py";
const TOKEN_WRITER_PATH = "/usr/local/bin/dust-gcs-write-token.sh";
const TOKEN_FIREWALL_PATH = "/usr/local/bin/dust-gcs-token-firewall.sh";
const TOKEN_SERVER_POLL_ATTEMPTS = 100;
const TOKEN_SERVER_POLL_INTERVAL_SECONDS = 0.05;
const TOKEN_SERVER_EXEC_TIMEOUT_MS = 10_000;
const TOKEN_BROKER_DENIED_USERS = ["agent", "agent-proxied"] as const;
const FILE_SYSTEM_OVERLAY_PATH = "/usr/local/bin/dust-fs-overlay.py";
const FILE_SYSTEM_OVERLAY_PYTHON_PATH = "/opt/venv/bin/python";
const FILE_SYSTEM_OVERLAY_RUNTIME_DIRECTORY = "/run/dust-fs";
const FILE_SYSTEM_OVERLAY_TOKEN_PATH = `${FILE_SYSTEM_OVERLAY_RUNTIME_DIRECTORY}/token`;
const FILE_SYSTEM_OVERLAY_USER = "dust-fs";
const FILE_SYSTEM_OVERLAY_MOUNT_POINT = "/files";
const FUSE_STATFS_MAGIC_HEX = "65735546";

class GCSMountImageHelperUnavailableError extends Error {
  constructor(
    readonly helperPath: string,
    readonly exitCode: number
  ) {
    super(
      `GCS mount helper is unavailable: ${helperPath} (exit code ${exitCode})`
    );
    this.name = "GCSMountImageHelperUnavailableError";
  }
}

class GCSMountTokenWriterUnavailableError extends GCSMountImageHelperUnavailableError {
  constructor(
    readonly mountPoint: string,
    exitCode: number
  ) {
    super(TOKEN_WRITER_PATH, exitCode);
    this.message = `GCS token writer is unavailable for ${mountPoint} (exit code ${exitCode})`;
    this.name = "GCSMountTokenWriterUnavailableError";
  }
}

function tokenId(index: number): string {
  return `mount-${index}`;
}

function tokenPath(index: number): string {
  return `${TOKEN_DIRECTORY}/${tokenId(index)}.json`;
}

function tokenUrl(index: number): string {
  return `${TOKEN_SERVER_PATH_PREFIX}/${tokenId(index)}`;
}

/**
 * Per-target mount profile.
 *
 * - "workload": root-mounted with `allow_other` so the unprivileged sandbox
 *   users can access it; permissive file/dir modes; 60s kernel list cache
 *   (read-mostly workloads). All agent-facing mounts.
 * - "pod_sandbox_functions": same access model as "workload", but without
 *   kernel list caching so newly published functions are visible immediately.
 * - "pod_state_replica": mounted AS `dust-state` (via runuser) so the FUSE
 *   default — only the mounting user can access the fs — makes it invisible to
 *   every other uid, including the untrusted workload uid 1003 and root. No
 *   `allow_other`, restrictive modes, and NO kernel list caching: litestream
 *   restore must never see a stale LTX listing. Needs the dust-state user and
 *   /pod-state layout in the image; targets with this profile are only ever
 *   constructed when a pod sandbox (the sandbox-functions computer) boots.
 */
export type GCSMountProfile =
  | "workload"
  | "pod_sandbox_functions"
  | "pod_state_replica";

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
  /**
   * Whether the user-visible mount should capture semantic mutations. This is
   * only enabled for conversation and pod file mounts; sandbox-only mounts
   * remain direct gcsfuse mounts.
   */
  mutationScope: { kind: "conversation" | "pod"; id: string } | null;
};

/**
 * GCS-specific SandboxMountAdapter.
 *
 * Mounts one GCS prefix per target via gcsfuse using a per-target CAB-scoped downscoped token
 * served by a root-owned HTTP token server baked into the sandbox image. The server listens on a
 * privileged loopback port and a dedicated nftables table denies every Front-controlled non-root
 * UID access to that port, including when dev-unrestricted egress removes the general egress table.
 * The UID firewall is the sole caller-authorization control; token ids are routing names, not
 * secrets.
 *
 * Each token has one unconditional rule plus two rules for its single prefix. The existing
 * four-target limit is retained as an operational guard on concurrent mounts.
 */
export class GCSSandboxMountAdapter implements SandboxMountAdapter {
  constructor(
    private readonly bucket: string,
    private readonly targets: ReadonlyArray<GCSMountTarget>
  ) {
    if (targets.length > 4) {
      throw new Error(
        `GCSSandboxMountAdapter: too many targets (${targets.length}), mount target limit is 4.`
      );
    }
    const trackedTargets = targets.filter(
      (target) => target.mutationScope !== null
    );
    if (trackedTargets.length > 2) {
      throw new Error(
        `GCSSandboxMountAdapter: too many mutation-tracked targets (${trackedTargets.length}), limit is 2.`
      );
    }
    if (trackedTargets.some((target) => target.mountProfile !== "workload")) {
      throw new Error(
        "GCSSandboxMountAdapter: only conversation and pod workload mounts can track mutations."
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

    const childLogger = logger.child({
      sandboxId: sandbox.sId,
      workspaceId,
      bucket,
      prefixes,
    });

    // 1-2. Mint and write one CAB-scoped token per mount target. Keeping targets in separate
    // credentials limits the blast radius of any individual credential; the UID firewall remains
    // the caller-authorization boundary for the broker itself.
    const tokenResults = await concurrentExecutor(
      targets.map((target, index) => ({ target, index })),
      async ({ target, index }) => {
        const result = await mintAndWriteToken({
          auth,
          sandbox,
          bucket,
          target,
          targetIndex: index,
        });
        return { result, target };
      },
      { concurrency: targets.length }
    );

    const tokenWriteFailure = tokenResults.find(({ result }) => result.isErr());
    if (tokenWriteFailure?.result.isErr()) {
      const { result, target } = tokenWriteFailure;
      childLogger.error(
        { err: result.error, mountPoint: target.sandboxMountPoint },
        "GCS sandbox mount: failed to prepare token"
      );
      if (result.error instanceof GCSMountTokenWriterUnavailableError) {
        await sandbox.requestKill();
      }
      return result;
    }

    // 3-4. Start the root-owned token server and poll it ready in
    // ONE exec. Polling every 50ms returns the instant the server is listening
    // instead of a flat sleep 1, and folds three round-trips into one.
    const tokenBrokerDenyChecks = TOKEN_BROKER_DENIED_USERS.map(
      (user) =>
        `/usr/sbin/runuser -u ${user} -- /usr/bin/curl -sf --connect-timeout 0.3 --max-time 1 ${tokenUrl(0)} > /dev/null 2>&1; ` +
        `deny_check_exit=$?; ` +
        `if [ $deny_check_exit -eq 0 ]; then ` +
        `/usr/bin/printf 'GCS token firewall deny-check unexpectedly reached the broker as ${user}\\n' >&2; ` +
        `exit 1; fi; ` +
        `if [ $deny_check_exit -ne 28 ]; then ` +
        `/usr/bin/printf 'GCS token firewall deny-check for ${user} could not be verified (exit code %s)\\n' "$deny_check_exit" >&2; ` +
        `exit 1; fi; `
    ).join("");
    const tokenServerResult = await traceSandboxStartupPhase(
      "gcs.token_server",
      () =>
        sandbox.execRoot(
          auth,
          rootCommand.unsafeShell(
            `${TOKEN_FIREWALL_PATH}; firewall_exit=$?; ` +
              `if [ $firewall_exit -ne 0 ]; then ` +
              `/usr/bin/printf 'GCS token firewall setup failed (exit code %s)\\n' "$firewall_exit" >&2; ` +
              `exit $firewall_exit; fi; ` +
              `(/usr/bin/nohup ${TOKEN_SERVER_PATH} >${TOKEN_DIRECTORY}/server.log 2>&1 &); server_start_exit=$?; ` +
              `if [ $server_start_exit -ne 0 ]; then ` +
              `/usr/bin/printf 'GCS token server start failed (exit code %s)\\n' "$server_start_exit" >&2; ` +
              `exit $server_start_exit; fi; ` +
              `i=0; while [ $i -lt ${TOKEN_SERVER_POLL_ATTEMPTS} ]; do ` +
              `if ! /usr/bin/curl -sf ${TOKEN_SERVER_HEALTH_URL} > /dev/null 2>&1; then ` +
              `/usr/bin/sleep ${TOKEN_SERVER_POLL_INTERVAL_SECONDS}; ` +
              `i=$((i+1)); continue; fi; ` +
              tokenBrokerDenyChecks +
              `exit 0; ` +
              `done; ` +
              `/usr/bin/printf 'GCS token server readiness timed out\\n' >&2; exit 1`,
            "Start and readiness-check the root-owned GCS token broker"
          ),
          { timeoutMs: TOKEN_SERVER_EXEC_TIMEOUT_MS }
        ),
      { sandbox_id: sandbox.sId }
    );
    if (tokenServerResult.isErr()) {
      childLogger.error(
        { err: tokenServerResult.error },
        "GCS sandbox mount: token server exec failed"
      );
      return tokenServerResult;
    }
    if (tokenServerResult.value.exitCode !== 0) {
      const details =
        tokenServerResult.value.stderr.trim() ||
        tokenServerResult.value.stdout.trim();
      const msg = details
        ? `GCS token server startup failed: ${details}`
        : "GCS token server not ready in time";
      childLogger.error(
        {
          stdout: tokenServerResult.value.stdout,
          stderr: tokenServerResult.value.stderr,
        },
        msg
      );
      return new Err(new Error(msg));
    }

    const usesFileSystemOverlay =
      image.hasCapability("dust_fs_overlay") &&
      targets.some((target) => target.mutationScope !== null);
    if (usesFileSystemOverlay) {
      const tokenResult = await mintAndWriteFileSystemToken({
        auth,
        sandbox,
        targets,
      });
      if (tokenResult.isErr()) {
        await sandbox.requestKill();
        return tokenResult;
      }
      const overlayRuntimeResult = await sandbox.execRoot(
        auth,
        rootCommand.and([
          rootCommand.exec("/usr/bin/install", [
            "-d",
            "-o",
            FILE_SYSTEM_OVERLAY_USER,
            "-g",
            FILE_SYSTEM_OVERLAY_USER,
            "-m",
            "700",
            FILE_SYSTEM_OVERLAY_RUNTIME_DIRECTORY,
            `${FILE_SYSTEM_OVERLAY_RUNTIME_DIRECTORY}/data`,
          ]),
          rootCommand.exec("/usr/bin/install", [
            "-d",
            "-o",
            FILE_SYSTEM_OVERLAY_USER,
            "-g",
            "agent",
            "-m",
            "2770",
            FILE_SYSTEM_OVERLAY_MOUNT_POINT,
          ]),
          // Supports an incremental rollout from images whose token writer
          // still initially stages this file for the agent account.
          rootCommand.exec("/usr/bin/chown", [
            `${FILE_SYSTEM_OVERLAY_USER}:${FILE_SYSTEM_OVERLAY_USER}`,
            FILE_SYSTEM_OVERLAY_TOKEN_PATH,
          ]),
        ])
      );
      if (overlayRuntimeResult.isErr()) {
        await sandbox.requestKill();
        return overlayRuntimeResult;
      }
      if (overlayRuntimeResult.value.exitCode !== 0) {
        await sandbox.requestKill();
        return new Err(
          new Error(
            `Dust filesystem overlay runtime setup failed: ${overlayRuntimeResult.value.stderr}`
          )
        );
      }
    }

    // 5. Create mount directories and run gcsfuse concurrently for each target.
    const mountResults = await concurrentExecutor(
      targets.map((target, index) => ({ target, index })),
      async ({ target, index }) => {
        const useFileSystemOverlay =
          image.hasCapability("dust_fs_overlay") &&
          target.mutationScope !== null;
        const dataMountPoint = useFileSystemOverlay
          ? fileSystemOverlayDataMountPoint(index)
          : target.sandboxMountPoint;
        const mkdirResult = await sandbox.execRoot(
          auth,
          useFileSystemOverlay
            ? rootCommand.exec("/usr/bin/install", [
                "-d",
                "-o",
                FILE_SYSTEM_OVERLAY_USER,
                "-g",
                FILE_SYSTEM_OVERLAY_USER,
                "-m",
                "700",
                dataMountPoint,
              ])
            : rootCommand.exec("/usr/bin/mkdir", [
                "-p",
                target.sandboxMountPoint,
              ])
        );
        if (mkdirResult.isErr()) {
          return mkdirResult;
        }

        const mountResult = await traceSandboxStartupPhase(
          "gcs.gcsfuse_mount",
          () =>
            sandbox.execRoot(
              auth,
              buildMountCommand({
                bucket,
                target,
                targetIndex: index,
                mountPoint: dataMountPoint,
              }),
              { timeoutMs: MOUNT_TIMEOUT_MS }
            ),
          { mount_point: target.sandboxMountPoint }
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

        // 6. Backward-compat symlink so old paths keep working.
        // The routed overlay exposes tracked legacy paths as synthetic symlinks.
        if (!useFileSystemOverlay && target.legacySandboxMountPoint) {
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

    if (usesFileSystemOverlay) {
      const trackedTargets = targets.flatMap((target, index) =>
        target.mutationScope ? [{ target, targetIndex: index }] : []
      );
      const overlayResult = await sandbox.execRoot(
        auth,
        buildFileSystemOverlayMountCommand({ trackedTargets, workspaceId }),
        { timeoutMs: MOUNT_TIMEOUT_MS }
      );
      if (overlayResult.isErr()) {
        childLogger.error(
          {
            err: overlayResult.error,
            mountPoint: FILE_SYSTEM_OVERLAY_MOUNT_POINT,
          },
          "Dust filesystem overlay mount failed"
        );
        await sandbox.requestKill();
        return overlayResult;
      }
      if (overlayResult.value.exitCode !== 0) {
        const output = overlayResult.value.stderr || overlayResult.value.stdout;
        const msg = `Dust filesystem overlay exited with code ${overlayResult.value.exitCode} for ${FILE_SYSTEM_OVERLAY_MOUNT_POINT}: ${output}`;
        childLogger.error(
          { output, mountPoint: FILE_SYSTEM_OVERLAY_MOUNT_POINT },
          msg
        );
        await sandbox.requestKill();
        return new Err(new Error(msg));
      }
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

    // Re-establish the dedicated broker UID drop before replacing any token files. This closes
    // the wake window where systemd/nftables state may have been reset before the lifecycle
    // egress check runs.
    const firewallResult = await ensureTokenFirewall(auth, sandbox);
    if (firewallResult.isErr()) {
      if (firewallResult.error instanceof GCSMountImageHelperUnavailableError) {
        await sandbox.requestKill();
      }
      return firewallResult;
    }

    const { targets } = this;
    const writeResults = await concurrentExecutor(
      targets.map((target, index) => ({ target, index })),
      async ({ target, index }) => {
        return mintAndWriteToken({
          auth,
          sandbox,
          bucket: this.bucket,
          target,
          targetIndex: index,
        });
      },
      { concurrency: targets.length }
    );
    const writeError = writeResults.find((result) => result.isErr());
    if (writeError) {
      if (writeError.error instanceof GCSMountTokenWriterUnavailableError) {
        logger.warn(
          { sandboxId: sandbox.sId, error: writeError.error },
          "GCS token writer is unavailable; requesting sandbox recreation"
        );
        await sandbox.requestKill();
      }
      return writeError;
    }

    if (image.hasCapability("dust_fs_overlay")) {
      const trackedTargets = targets.filter(
        (target) => target.mutationScope !== null
      );
      if (trackedTargets.length > 0) {
        const tokenResult = await mintAndWriteFileSystemToken({
          auth,
          sandbox,
          targets,
        });
        if (tokenResult.isErr()) {
          await sandbox.requestKill();
          return tokenResult;
        }
        const livenessResult = await checkFileSystemOverlayLiveness(
          auth,
          sandbox
        );
        if (livenessResult.isErr()) {
          logger.error(
            {
              err: livenessResult.error,
              sandboxId: sandbox.sId,
              workspaceId: auth.getNonNullableWorkspace().sId,
            },
            "Dust filesystem overlay is not live; requesting sandbox recreation"
          );
          await sandbox.requestKill();
          return livenessResult;
        }
      }
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

  /** Exposed for testing and diagnostics. */
  getAccessBoundaryRules() {
    return this.targets.map((target) =>
      buildAccessBoundaryRules(this.bucket, [
        { prefix: target.gcsPrefix, readOnly: target.readOnly },
      ])
    );
  }
}

async function checkFileSystemOverlayLiveness(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  const result = await sandbox.execRoot(
    auth,
    rootCommand.exec("/usr/sbin/runuser", [
      "-u",
      "agent-proxied",
      "--",
      "/usr/bin/stat",
      "-f",
      "-c",
      "%t",
      FILE_SYSTEM_OVERLAY_MOUNT_POINT,
    ]),
    { timeoutMs: 10_000 }
  );
  if (result.isErr()) {
    return result;
  }
  if (result.value.exitCode !== 0) {
    return new Err(
      new Error(
        `Dust filesystem overlay statfs failed for ${FILE_SYSTEM_OVERLAY_MOUNT_POINT}: ${result.value.stderr || result.value.stdout}`
      )
    );
  }
  if (result.value.stdout.trim().toLowerCase() !== FUSE_STATFS_MAGIC_HEX) {
    return new Err(
      new Error(
        `Dust filesystem overlay is not a FUSE mount at ${FILE_SYSTEM_OVERLAY_MOUNT_POINT} (statfs magic: ${result.value.stdout.trim()})`
      )
    );
  }
  return new Ok(undefined);
}

/** Exported for testing. */
export function buildMountCommand({
  bucket,
  target,
  targetIndex = 0,
  mountPoint = target.sandboxMountPoint,
}: {
  bucket: string;
  target: GCSMountTarget;
  targetIndex?: number;
  mountPoint?: string;
}): RootCommand {
  const { gcsPrefix: prefix } = target;

  const commonFlags = [
    "--token-url",
    tokenUrl(targetIndex),
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
    case "workload":
    case "pod_sandbox_functions": {
      // allow_other lets the unprivileged sandbox user read the root-mounted fs. `ro` is only
      // defense-in-depth: the real write protection is the read-only token scope (see
      // buildAccessBoundaryRules), not this flag.
      const mountOptions = ["allow_other"];
      if (target.readOnly) {
        mountOptions.push("ro");
      }
      const kernelListCacheTtlSeconds =
        target.mountProfile === "pod_sandbox_functions" ||
        target.mutationScope !== null
          ? 0
          : 60;

      const flags = [
        ...commonFlags,
        "-o",
        mountOptions.join(","),
        "--file-mode=666",
        "--dir-mode=777",
        `--kernel-list-cache-ttl-secs=${kernelListCacheTtlSeconds}`,
        ...(target.mutationScope !== null
          ? [
              "--metadata-cache-ttl-secs=0",
              "--metadata-cache-negative-ttl-secs=0",
            ]
          : []),
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

export function fileSystemOverlayDataMountPoint(targetIndex: number): string {
  return `${FILE_SYSTEM_OVERLAY_RUNTIME_DIRECTORY}/data/mount-${targetIndex}`;
}

/** Exported for focused command tests. */
export function buildFileSystemOverlayMountCommand({
  trackedTargets,
  workspaceId,
}: {
  trackedTargets: ReadonlyArray<{
    target: GCSMountTarget;
    targetIndex: number;
  }>;
  workspaceId: string;
}): RootCommand {
  if (trackedTargets.length === 0 || trackedTargets.length > 2) {
    throw new Error("Filesystem overlay requires one or two tracked targets.");
  }
  const args = [
    "-u",
    FILE_SYSTEM_OVERLAY_USER,
    "--",
    FILE_SYSTEM_OVERLAY_PYTHON_PATH,
    FILE_SYSTEM_OVERLAY_PATH,
    "--mountpoint",
    FILE_SYSTEM_OVERLAY_MOUNT_POINT,
    "--api-url",
    `${dustAPIBaseUrlForSandbox()}/api/v1/w/${workspaceId}/sandbox/filesystem/mutations`,
    "--token-file",
    FILE_SYSTEM_OVERLAY_TOKEN_PATH,
  ];

  for (const { target, targetIndex } of trackedTargets) {
    if (!target.mutationScope) {
      throw new Error("Filesystem overlay target has no mutation scope.");
    }
    const name = target.sandboxMountPoint.split("/").filter(Boolean).at(-1);
    if (!name) {
      throw new Error("Filesystem overlay target has an invalid mount point.");
    }
    const legacyName = target.legacySandboxMountPoint
      ?.split("/")
      .filter(Boolean)
      .at(-1);
    args.push(
      "--mount-spec",
      JSON.stringify({
        name,
        source: fileSystemOverlayDataMountPoint(targetIndex),
        kind: target.mutationScope.kind,
        ownerId: target.mutationScope.id,
        readOnly: target.readOnly,
        legacyName: legacyName ?? null,
      })
    );
  }
  return rootCommand.stderrToStdout(
    rootCommand.timeout(
      rootCommand.exec("/usr/sbin/runuser", args),
      MOUNT_TIMEOUT_MS / 1_000
    )
  );
}

function dustAPIBaseUrlForSandbox(): string {
  return isDevelopment() && config.getSandboxDevFrontHostName()
    ? `https://${config.getSandboxDevFrontHostName()}`
    : config.getApiBaseUrl();
}

async function mintAndWriteFileSystemToken({
  auth,
  sandbox,
  targets,
}: {
  auth: Authenticator;
  sandbox: SandboxResource;
  targets: ReadonlyArray<GCSMountTarget>;
}): Promise<Result<void, Error>> {
  const mounts = targets.flatMap((target) =>
    target.mutationScope ? [target.mutationScope] : []
  );
  if (mounts.length === 0) {
    return new Ok(undefined);
  }

  const token = await generateSandboxFileSystemToken(auth, {
    sandbox,
    mounts,
  });
  const writeResult = await sandbox.execRoot(
    auth,
    rootCommand.exec(TOKEN_WRITER_PATH, [FILE_SYSTEM_OVERLAY_TOKEN_PATH]),
    { stdin: token }
  );
  if (writeResult.isErr()) {
    return writeResult;
  }
  if (writeResult.value.exitCode !== 0) {
    return new Err(
      new Error(
        `Filesystem mutation token write failed: ${writeResult.value.stderr || writeResult.value.stdout}`
      )
    );
  }

  return new Ok(undefined);
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

async function mintAndWriteToken({
  auth,
  sandbox,
  bucket,
  target,
  targetIndex,
}: {
  auth: Authenticator;
  sandbox: SandboxResource;
  bucket: string;
  target: GCSMountTarget;
  targetIndex: number;
}): Promise<Result<void, Error>> {
  const tokenResult = await traceSandboxStartupPhase(
    "gcs.mint_token",
    () =>
      mintDownscopedGcsToken({
        bucket,
        prefixes: [{ prefix: target.gcsPrefix, readOnly: target.readOnly }],
      }),
    { mount_point: target.sandboxMountPoint }
  );
  if (tokenResult.isErr()) {
    return tokenResult;
  }

  // The bearer token is sent over stdin so it never appears in argv, shell history, or provider
  // command tracing. The image helper writes it atomically as root with mode 0600.
  const writeResult = await sandbox.execRoot(
    auth,
    rootCommand.exec(TOKEN_WRITER_PATH, [tokenPath(targetIndex)]),
    { stdin: buildTokenJson(tokenResult.value) }
  );
  if (writeResult.isErr()) {
    return writeResult;
  }
  if (writeResult.value.exitCode !== 0) {
    if (
      writeResult.value.exitCode === 126 ||
      writeResult.value.exitCode === 127
    ) {
      return new Err(
        new GCSMountTokenWriterUnavailableError(
          target.sandboxMountPoint,
          writeResult.value.exitCode
        )
      );
    }
    return new Err(
      new Error(
        `GCS token write failed for ${target.sandboxMountPoint}: ${writeResult.value.stderr}`
      )
    );
  }

  return new Ok(undefined);
}

async function ensureTokenFirewall(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  const result = await sandbox.execRoot(
    auth,
    rootCommand.exec(TOKEN_FIREWALL_PATH)
  );
  if (result.isErr()) {
    return result;
  }
  if (result.value.exitCode === 126 || result.value.exitCode === 127) {
    return new Err(
      new GCSMountImageHelperUnavailableError(
        TOKEN_FIREWALL_PATH,
        result.value.exitCode
      )
    );
  }
  if (result.value.exitCode !== 0) {
    return new Err(
      new Error(
        `GCS token firewall setup failed: ${result.value.stderr || result.value.stdout}`
      )
    );
  }
  return new Ok(undefined);
}
