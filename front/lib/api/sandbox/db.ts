import {
  recordSandboxStateHealth,
  traceSandboxStartupPhase,
} from "@app/lib/api/sandbox/instrumentation";
import { SandboxNotFoundError } from "@app/lib/api/sandbox/provider";
import type {
  RootCommand,
  RootCommandArg,
} from "@app/lib/api/sandbox/root_command";
import { rootCommand } from "@app/lib/api/sandbox/root_command";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { concurrentExecutor } from "@app/temporal/workflow_utils";
import {
  getPodStateBasePath,
  SANDBOX_STATE_DATABASES_DIR,
  SANDBOX_STATE_REPLICA_MOUNT_POINT,
} from "@app/types/mount_path";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Sandbox state runtime plumbing: SQLite databases under the live database directory,
 * continuously replicated by a litestream daemon (running as dust-state) to a
 * gcsfuse-mounted GCS prefix at /sandbox-state/replica.
 *
 * The daemon runs litestream's directory watcher over that directory
 * (static /etc/litestream.yml baked at image build): databases created at any
 * point — including publish-time `dsbx db reconcile` — are discovered and
 * replicated automatically within seconds. Replica subdirectories are named
 * by database FILENAME: /sandbox-state/replica/{db}.db/ltx/...
 *
 * Lifecycle:
 *  - Cold start (`setupSandboxStateOnColdStart`, after the gcsfuse mounts): restore
 *    each replicated database (temp file + PRAGMA quick_check + atomic rename),
 *    then start the litestream systemd unit — strictly in that order, so the
 *    watcher never manages files mid-restore or writes to an unmounted
 *    replica dir.
 *  - Pre-sleep (`ensureSandboxStateHealthOnSleep`, before the provider pause):
 *    verify the replica mount is a live FUSE mount and the daemon is active,
 *    then `litestream sync -wait` each database so every committed WAL frame
 *    is in GCS before the VM can be destroyed. On failure the sandbox is NOT
 *    paused; the daemon is restarted and a failure metric is emitted.
 *  - Wake from pause needs nothing: the Firecracker snapshot preserves the
 *    daemon, its control socket, the mounts and the database files.
 */

/** System user running the litestream daemon and owning the replica mount. */
const SANDBOX_STATE_USER = "dust-state";

const LITESTREAM_BIN = "/opt/bin/litestream";
const LITESTREAM_UNIT_NAME = "litestream";
// Short by necessity: unix socket paths are capped around 104 chars. Created
// by the unit's RuntimeDirectory=litestream as dust-state; enabled by the
// static /etc/litestream.yml baked at image build.
const LITESTREAM_SOCKET_PATH = "/run/litestream/litestream.sock";

const RUNUSER_BIN = "/usr/sbin/runuser";
const SYSTEMCTL_BIN = "/usr/bin/systemctl";
const SQLITE3_BIN = "/usr/bin/sqlite3";
const FIND_BIN = "/usr/bin/find";
const STAT_BIN = "/usr/bin/stat";
const MV_BIN = "/usr/bin/mv";
const RM_BIN = "/usr/bin/rm";
const CHMOD_BIN = "/usr/bin/chmod";
const HEAD_BIN = "/usr/bin/head";
const TEST_BIN = "/usr/bin/test";

// Old sandboxes keep their original image and mount layout until they are
// recycled after deployment. Only the pre-sleep liveness probe needs this
// bridge; new cold starts, restores, and mounts always use the canonical path.
const LEGACY_POD_STATE_REPLICA_MOUNT_POINT = "/pod-state/replica";
const SANDBOX_STATE_ROOT_DIR = "/sandbox-state";

// Database name shape. Doubles as an allowlist: enumeration outputs are
// workload-influenced, so anything not matching (dotfiles, litestream sidecar
// dirs, hostile names) is skipped.
const SANDBOX_DATABASE_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// First 15 bytes of every SQLite file ("SQLite format 3" — the trailing NUL of
// the 16-byte magic is dropped so it survives stdout transport).
const SQLITE_HEADER_MAGIC = "SQLite format 3";

// FUSE_SUPER_MAGIC, as printed by `stat -f -c %t` (hex, no 0x prefix).
// If you are wondering, it is a value in a enum used by statf libc to flag different filesystems (ext2,3,4, fuse etc.)
// https://man7.org/linux/man-pages/man2/statfs.2.html
const FUSE_STATFS_MAGIC_HEX = "65735546";

// The pre-sleep sync runs inside the reaper's per-batch budget, so every exec
// is tightly bounded.
const SYNC_WAIT_TIMEOUT_SECONDS = 10;
const SYNC_EXEC_TIMEOUT_MS = 15_000;
// Cheap probes and file operations stay tightly bounded.
const PROBE_EXEC_TIMEOUT_MS = 10_000;
// A restart waits out the stop half, and litestream's graceful shutdown syncs
// every managed database before exiting: seconds normally, up to the unit's
// 90s TimeoutStopSec when one of them cannot reach its replica.
const DAEMON_RESTART_EXEC_TIMEOUT_MS = 120_000;
// Cold-start restore may pull a large snapshot + LTX chain through gcsfuse.
const RESTORE_EXEC_TIMEOUT_MS = 120_000;

export function isValidSandboxDatabaseName(name: string): boolean {
  return SANDBOX_DATABASE_NAME_REGEX.test(name);
}

export const isValidPodDatabaseName = isValidSandboxDatabaseName;

/**
 * Parse `find <replica-dir> -mindepth 1 -maxdepth 1 -type d` output into
 * database names. The directory watcher names replica subdirectories by
 * database FILENAME (`{db}.db/`), so the `.db` suffix is stripped before
 * validation. Non-conforming entries are dropped (see the name regex).
 */
export function parseReplicaDatabaseNames(findOutput: string): string[] {
  return parseFindBasenames(findOutput)
    .filter((name) => name.endsWith(".db"))
    .map((name) => name.slice(0, -".db".length))
    .filter(isValidSandboxDatabaseName)
    .sort();
}

/**
 * Parse `find <databases-dir> -mindepth 1 -maxdepth 1 -type f -name '*.db'`
 * output into database names.
 */
export function parseLiveDatabaseNames(findOutput: string): string[] {
  return parseFindBasenames(findOutput)
    .filter((name) => name.endsWith(".db"))
    .map((name) => name.slice(0, -".db".length))
    .filter(isValidSandboxDatabaseName)
    .sort();
}

function parseFindBasenames(findOutput: string): string[] {
  return findOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.slice(line.lastIndexOf("/") + 1));
}

/** True when `stat -f -c %t` output is the FUSE filesystem magic. */
export function isFuseStatfsMagic(statOutput: string): boolean {
  return statOutput.trim().toLowerCase() === FUSE_STATFS_MAGIC_HEX;
}

/**
 * Run a command as dust-state. Everything touching the replica mount must run
 * as dust-state: the mount has no allow_other, so even root is denied by the
 * FUSE layer.
 */
function asSandboxStateUser(
  executable: string,
  args: readonly RootCommandArg[]
): RootCommand {
  if (!executable.startsWith("/")) {
    throw new Error(
      `sandbox-state command executable must be absolute: ${executable}`
    );
  }
  return rootCommand.exec(RUNUSER_BIN, [
    "-u",
    SANDBOX_STATE_USER,
    "--",
    executable,
    ...args,
  ]);
}

function execFailure(
  label: string,
  result: { exitCode: number; stdout: string; stderr: string }
): Error {
  return new Error(
    `${label} failed (exit ${result.exitCode}): ${result.stderr || result.stdout || "no output"}`
  );
}

/**
 * Cold-start bring-up, called from the freshlyCreated lifecycle branch AFTER
 * the gcsfuse mounts are up (the restore reads through the replica mount).
 * Failures block sandbox readiness on purpose: `invoke` awaits
 * `ensurePodSandboxReady`, which is what guarantees no function ever runs
 * against a half-restored database.
 */
export async function setupSandboxStateOnColdStart(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  const childLogger = logger.child({
    sandboxId: sandbox.sId,
    workspaceId: auth.getNonNullableWorkspace().sId,
  });

  return traceSandboxStartupPhase("pod_state_setup", async () => {
    // 1. Enumerate replicated databases (as dust-state, through the mount).
    const namesResult = await traceSandboxStartupPhase(
      "pod_state.enumerate",
      () => listReplicaDatabases(auth, sandbox)
    );
    if (namesResult.isErr()) {
      childLogger.error(
        { err: namesResult.error },
        "Sandbox state cold start: replica enumeration failed"
      );
      return namesResult;
    }
    const names = namesResult.value;

    // 2. Restore each database: temp file + quick_check + atomic rename.
    // Concurrent (bounded): each restore is one sandbox exec streaming
    // through the replica mount, so the wall clock is the slowest database
    // instead of the sum — and every database keeps its own exec timeout.
    const restoreResults = await concurrentExecutor(
      names,
      async (name) => {
        const restoreResult = await traceSandboxStartupPhase(
          "pod_state.restore_db",
          () => restoreSandboxDatabase(auth, sandbox, name),
          { database: name }
        );
        if (restoreResult.isErr()) {
          childLogger.error(
            { err: restoreResult.error, database: name },
            "Sandbox state cold start: database restore failed"
          );
        }
        return restoreResult;
      },
      { concurrency: 10 }
    );
    const firstRestoreError = restoreResults.find((result) => result.isErr());
    if (firstRestoreError) {
      return firstRestoreError;
    }

    // 3. Start the daemon (unit + static directory-watcher config baked into
    // the image; the unit is deliberately not enabled at boot so it cannot
    // write to the unmounted replica dir or manage files mid-restore). The
    // watcher discovers the restored files and any database created later.
    // Awaited: a sandbox whose replication never started must not become
    // ready.
    const startResult = await traceSandboxStartupPhase(
      "pod_state.start_daemon",
      () => startLitestreamDaemon(auth, sandbox)
    );
    if (startResult.isErr()) {
      childLogger.error(
        { err: startResult.error },
        "Sandbox state cold start: litestream daemon start failed"
      );
      return startResult;
    }

    childLogger.info(
      { databases: names },
      "Sandbox state cold start: restore complete, litestream started"
    );
    return new Ok(undefined);
  });
}

// Compatibility alias for callers predating Frame-owned sandboxes.
export const setupPodStateOnColdStart = setupSandboxStateOnColdStart;

async function listReplicaDatabases(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<string[], Error>> {
  const result = await sandbox.execRoot(
    auth,
    asSandboxStateUser(FIND_BIN, [
      SANDBOX_STATE_REPLICA_MOUNT_POINT,
      "-mindepth",
      "1",
      "-maxdepth",
      "1",
      "-type",
      "d",
    ]),
    { timeoutMs: PROBE_EXEC_TIMEOUT_MS }
  );
  if (result.isErr()) {
    return result;
  }
  if (result.value.exitCode !== 0) {
    return new Err(
      execFailure("sandbox state replica enumeration", result.value)
    );
  }
  return new Ok(parseReplicaDatabaseNames(result.value.stdout));
}

async function restoreSandboxDatabase(
  auth: Authenticator,
  sandbox: SandboxResource,
  name: string
): Promise<Result<void, Error>> {
  const dbPath = `${SANDBOX_STATE_DATABASES_DIR}/${name}.db`;
  const tmpPath = `${SANDBOX_STATE_DATABASES_DIR}/.restore-${name}.db`;
  // Replica subdir named by database FILENAME (directory watcher layout).
  const replicaUrl = `file://${SANDBOX_STATE_REPLICA_MOUNT_POINT}/${name}.db`;

  const failAndCleanup = async (err: Error): Promise<Result<void, Error>> => {
    // Best effort: a leftover temp file is invisible to enumeration (dotfile)
    // and overwritten by the next restore attempt anyway.
    await sandbox.execRoot(
      auth,
      rootCommand.exec(RM_BIN, ["-f", "--", tmpPath]),
      {
        timeoutMs: PROBE_EXEC_TIMEOUT_MS,
      }
    );
    return new Err(err);
  };

  // Restore into a temp file in the SAME directory so the final rename is an
  // atomic same-filesystem move. Runs as dust-state (replica mount access).
  // -if-replica-exists tolerates a replica directory with no restorable
  // backup (e.g. a crash during the very first LTX upload leaving only a
  // stray .tmp object): litestream then exits 0 WITHOUT writing the output
  // file, and we skip the database instead of bricking every cold start of
  // the pod.
  const restoreResult = await sandbox.execRoot(
    auth,
    asSandboxStateUser(LITESTREAM_BIN, [
      "restore",
      "-if-replica-exists",
      "-o",
      tmpPath,
      replicaUrl,
    ]),
    { timeoutMs: RESTORE_EXEC_TIMEOUT_MS }
  );
  if (restoreResult.isErr()) {
    return restoreResult;
  }
  if (restoreResult.value.exitCode !== 0) {
    return failAndCleanup(
      execFailure(`litestream restore of ${name}`, restoreResult.value)
    );
  }

  const restoredResult = await sandbox.execRoot(
    auth,
    rootCommand.exec(TEST_BIN, ["-f", tmpPath]),
    { timeoutMs: PROBE_EXEC_TIMEOUT_MS }
  );
  if (restoredResult.isErr()) {
    return restoredResult;
  }
  if (restoredResult.value.exitCode !== 0) {
    logger.warn(
      { database: name },
      "Sandbox state cold start: replica directory has no restorable backup, skipping database"
    );
    return new Ok(undefined);
  }

  // Integrity gate: corrupt LTX chains fail the restore itself loudly, but
  // quick_check also catches page-level corruption that slipped through.
  const checkResult = await sandbox.execRoot(
    auth,
    asSandboxStateUser(SQLITE3_BIN, ["--", tmpPath, "PRAGMA quick_check;"]),
    { timeoutMs: RESTORE_EXEC_TIMEOUT_MS }
  );
  if (checkResult.isErr()) {
    return checkResult;
  }
  if (
    checkResult.value.exitCode !== 0 ||
    checkResult.value.stdout.trim() !== "ok"
  ) {
    return failAndCleanup(
      new Error(
        `PRAGMA quick_check failed for restored database ${name}: ${
          checkResult.value.stdout || checkResult.value.stderr || "no output"
        }`
      )
    );
  }

  // 660: the restored file must be writable by group `agent` (function code
  // runs as agent-proxied) as well as by dust-state; the databases dir is
  // setgid so the group is already `agent`.
  const finalizeResult = await sandbox.execRoot(
    auth,
    rootCommand.and([
      rootCommand.exec(CHMOD_BIN, ["660", "--", tmpPath]),
      rootCommand.exec(MV_BIN, ["-f", "--", tmpPath, dbPath]),
    ]),
    { timeoutMs: PROBE_EXEC_TIMEOUT_MS }
  );
  if (finalizeResult.isErr()) {
    return finalizeResult;
  }
  if (finalizeResult.value.exitCode !== 0) {
    return failAndCleanup(
      execFailure(`pod state restore finalize of ${name}`, finalizeResult.value)
    );
  }

  return new Ok(undefined);
}

async function startLitestreamDaemon(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  const result = await sandbox.execRoot(
    auth,
    rootCommand.exec(SYSTEMCTL_BIN, ["start", LITESTREAM_UNIT_NAME]),
    { timeoutMs: PROBE_EXEC_TIMEOUT_MS }
  );
  if (result.isErr()) {
    return result;
  }
  if (result.value.exitCode !== 0) {
    return new Err(execFailure("litestream daemon start", result.value));
  }
  return new Ok(undefined);
}

/**
 * Restart the litestream daemon: re-derive the managed set from what is live on disk right now.
 *
 * The directory watcher only enumerates the live database directory at start, so a database whose
 * files were just deleted stays open in the running daemon — free to keep writing to, and so
 * recreate, the replica prefix a delete is about to wipe. A restart is what makes the daemon let go
 * of it, and the static config (baked at image build) brings back every database that IS still live.
 *
 * The default budget covers a full graceful shutdown; callers on a tight path (the pre-sleep check
 * runs inside the reaper's per-batch budget) pass their own and accept a timeout instead.
 */
export async function restartLitestreamDaemon(
  auth: Authenticator,
  sandbox: SandboxResource,
  { timeoutMs = DAEMON_RESTART_EXEC_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<Result<void, Error>> {
  const result = await sandbox.execRoot(
    auth,
    rootCommand.exec(SYSTEMCTL_BIN, ["restart", LITESTREAM_UNIT_NAME]),
    { timeoutMs }
  );
  if (result.isErr()) {
    return result;
  }
  if (result.value.exitCode !== 0) {
    return new Err(execFailure("litestream daemon restart", result.value));
  }
  return new Ok(undefined);
}

/**
 * Pre-sleep health check (reaper sleep, pauseForApproval, and best-effort
 * before kill-requested destroys): make sure every committed transaction
 * reached the GCS replica before the VM is allowed to pause (and later be
 * destroyed).
 *
 * Databases created after cold start are the directory watcher's job (static
 * config, discovery within seconds); this only checks that the daemon is
 * actually active (starting it when dead, e.g. after a half-failed cold
 * start) and then syncs each live database.
 *
 * On any failure the caller must NOT pause. A failure health metric +
 * logger.error with a stable message are emitted — Datadog monitors do the
 * paging. A `SandboxNotFoundError` from the provider is treated as success:
 * the sandbox is already gone, there is nothing left to sync, and exec already
 * marked the row deleted.
 */
export async function ensureSandboxStateHealthOnSleep(
  auth: Authenticator,
  sandbox: SandboxResource,
  opts: {
    /**
     * Rewrites the root-owned per-mount credentials. The sync flushes LTX files through gcsfuse,
     * and a sandbox can sit idle past the CAB token's ~1h lifetime (reaper
     * backlog): without a refresh the sync would fail on every retry,
     * forever.
     */
    refreshMountCredential?: () => Promise<Result<void, Error>>;
  } = {}
): Promise<Result<void, Error>> {
  const ctx = { workspaceId: auth.getNonNullableWorkspace().sId };
  const childLogger = logger.child({
    sandboxId: sandbox.sId,
    workspaceId: ctx.workspaceId,
  });

  // 0. Fresh GCS credential for the flush below.
  if (opts.refreshMountCredential) {
    const refreshResult = await opts.refreshMountCredential();
    if (refreshResult.isErr()) {
      if (refreshResult.error instanceof SandboxNotFoundError) {
        return new Ok(undefined);
      }
      recordSandboxStateHealth("failure");
      childLogger.error(
        { err: refreshResult.error },
        "Sandbox state pre-sleep: GCS credential refresh failed, not pausing"
      );
      return refreshResult;
    }
  }

  // 1. Mount liveness (statfs magic): a cleanly-unmounted replica path makes
  // litestream write to the underlying local directory and SUCCEED silently,
  // so a passing sync would be meaningless.
  const livenessResult = await checkReplicaMountLiveness(auth, sandbox);
  if (livenessResult.isErr()) {
    if (livenessResult.error instanceof SandboxNotFoundError) {
      return new Ok(undefined);
    }
    recordSandboxStateHealth("failure");
    childLogger.error(
      { err: livenessResult.error },
      "Sandbox state pre-sleep: replica mount is not a live FUSE mount, not pausing"
    );
    return livenessResult;
  }

  // 2. Managed set: enumerate live databases, dropping files that are not
  // real SQLite databases. The dir is deliberately workload-writable, so a
  // planted garbage `.db` must be excluded (alerted) rather than allowed to
  // wedge the pod's lifecycle with forever-failing syncs.
  const namesResult = await listValidLiveDatabases(auth, sandbox, ctx);
  if (namesResult.isErr()) {
    if (namesResult.error instanceof SandboxNotFoundError) {
      return new Ok(undefined);
    }
    recordSandboxStateHealth("failure");
    childLogger.error(
      { err: namesResult.error },
      "Sandbox state pre-sleep: database enumeration failed, not pausing"
    );
    return namesResult;
  }
  const names = namesResult.value;

  // 3. Daemon liveness: the sync below needs the control socket, and a dead
  // or never-started daemon (e.g. a half-failed cold start) means nothing is
  // replicating. Start it if needed — the static directory-watcher config is
  // baked in the image, so a plain start recovers the full managed set.
  const daemonResult = await ensureLitestreamDaemonActive(
    auth,
    sandbox,
    childLogger
  );
  if (daemonResult.isErr()) {
    if (daemonResult.error instanceof SandboxNotFoundError) {
      return new Ok(undefined);
    }
    recordSandboxStateHealth("failure");
    childLogger.error(
      { err: daemonResult.error },
      "Sandbox state pre-sleep: litestream daemon is not active, not pausing"
    );
    return daemonResult;
  }

  // 4. Sync each database through the daemon control socket.
  for (const name of names) {
    const dbPath = `${SANDBOX_STATE_DATABASES_DIR}/${name}.db`;
    const syncResult = await sandbox.execRoot(
      auth,
      rootCommand.exec(LITESTREAM_BIN, [
        "sync",
        "-wait",
        "-timeout",
        SYNC_WAIT_TIMEOUT_SECONDS,
        "-socket",
        LITESTREAM_SOCKET_PATH,
        "--",
        dbPath,
      ]),
      { timeoutMs: SYNC_EXEC_TIMEOUT_MS }
    );

    const failure = syncResult.isErr()
      ? syncResult.error
      : syncResult.value.exitCode !== 0
        ? execFailure(`litestream sync of ${name}`, syncResult.value)
        : null;

    if (failure) {
      if (failure instanceof SandboxNotFoundError) {
        return new Ok(undefined);
      }
      recordSandboxStateHealth("failure");
      childLogger.error(
        { err: failure, database: name },
        "Sandbox state pre-sleep: litestream sync failed, restarting daemon and not pausing"
      );
      // Best-effort recovery; the reaper retries the whole check on its next
      // cycle (status stays `running`), so this keeps the probe budget rather
      // than waiting out a full graceful shutdown here.
      await restartLitestreamDaemon(auth, sandbox, {
        timeoutMs: PROBE_EXEC_TIMEOUT_MS,
      });
      return new Err(failure);
    }
  }

  recordSandboxStateHealth("success");

  return new Ok(undefined);
}

// Compatibility alias for callers predating Frame-owned sandboxes.
export const ensurePodStateHealthOnSleep = ensureSandboxStateHealthOnSleep;

export async function checkReplicaMountLiveness(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  // As dust-state: without allow_other the FUSE layer denies every other uid,
  // including root. `stat -f -c %t` prints the statfs filesystem magic.
  const result = await statReplicaMount(
    auth,
    sandbox,
    SANDBOX_STATE_REPLICA_MOUNT_POINT
  );
  if (result.isErr() || result.value.exitCode === 0) {
    return validateReplicaMountStat(result);
  }

  // Sandboxes booted from the previous image do not have /sandbox-state at
  // all. They keep running during the deployment drain, so allow their old
  // replica mount to flush before sleep. If the new root exists, fail closed:
  // the canonical mount is broken rather than legacy.
  const rootMissingResult = await sandbox.execRoot(
    auth,
    rootCommand.exec(TEST_BIN, ["!", "-d", SANDBOX_STATE_ROOT_DIR]),
    { timeoutMs: PROBE_EXEC_TIMEOUT_MS }
  );
  if (rootMissingResult.isErr()) {
    return rootMissingResult;
  }
  if (rootMissingResult.value.exitCode !== 0) {
    return validateReplicaMountStat(result);
  }

  return validateReplicaMountStat(
    await statReplicaMount(auth, sandbox, LEGACY_POD_STATE_REPLICA_MOUNT_POINT)
  );
}

async function statReplicaMount(
  auth: Authenticator,
  sandbox: SandboxResource,
  mountPoint: string
) {
  return sandbox.execRoot(
    auth,
    asSandboxStateUser(STAT_BIN, ["-f", "-c", "%t", mountPoint]),
    { timeoutMs: PROBE_EXEC_TIMEOUT_MS }
  );
}

function validateReplicaMountStat(
  result: Awaited<ReturnType<typeof statReplicaMount>>
): Result<void, Error> {
  if (result.isErr()) {
    return result;
  }
  if (result.value.exitCode !== 0) {
    return new Err(execFailure("sandbox state replica statfs", result.value));
  }
  if (!isFuseStatfsMagic(result.value.stdout)) {
    return new Err(
      new Error(
        `sandbox state replica mount point is not a FUSE mount (statfs magic: ${result.value.stdout.trim()})`
      )
    );
  }
  return new Ok(undefined);
}

async function listLiveDatabases(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<string[], Error>> {
  const result = await sandbox.execRoot(
    auth,
    rootCommand.exec(FIND_BIN, [
      SANDBOX_STATE_DATABASES_DIR,
      "-mindepth",
      "1",
      "-maxdepth",
      "1",
      "-type",
      "f",
      "-name",
      "*.db",
    ]),
    { timeoutMs: PROBE_EXEC_TIMEOUT_MS }
  );
  if (result.isErr()) {
    return result;
  }
  if (result.value.exitCode !== 0) {
    return new Err(
      execFailure("sandbox state database enumeration", result.value)
    );
  }
  return new Ok(parseLiveDatabaseNames(result.value.stdout));
}

/**
 * Live databases whose file content starts with the SQLite header magic.
 * The live database directory is workload-writable by design, so enumeration output
 * must be treated as untrusted: non-SQLite files are excluded from the
 * managed set (with a warning log) instead of being handed to litestream,
 * where they would fail every sync and wedge the pod's lifecycle. A valid
 * header on a corrupt database still enters the set — its sync failure then
 * blocks-and-alerts, which is the designed behavior for real corruption.
 */
async function listValidLiveDatabases(
  auth: Authenticator,
  sandbox: SandboxResource,
  ctx: { workspaceId: string }
): Promise<Result<string[], Error>> {
  const namesResult = await listLiveDatabases(auth, sandbox);
  if (namesResult.isErr()) {
    return namesResult;
  }

  const valid: string[] = [];
  for (const name of namesResult.value) {
    const dbPath = `${SANDBOX_STATE_DATABASES_DIR}/${name}.db`;
    const headResult = await sandbox.execRoot(
      auth,
      rootCommand.exec(HEAD_BIN, ["-c", "15", "--", dbPath]),
      { timeoutMs: PROBE_EXEC_TIMEOUT_MS }
    );
    if (headResult.isErr()) {
      return headResult;
    }
    if (
      headResult.value.exitCode === 0 &&
      headResult.value.stdout.startsWith(SQLITE_HEADER_MAGIC)
    ) {
      valid.push(name);
    } else {
      logger.warn(
        {
          sandboxId: sandbox.sId,
          workspaceId: ctx.workspaceId,
          database: name,
        },
        "Pod state: non-SQLite file in the databases dir — excluded from the managed set"
      );
    }
  }
  return new Ok(valid);
}

/**
 * Make sure the litestream unit is running, starting it when dead. The static
 * directory-watcher config re-discovers every live database on start, so a
 * plain start recovers the full managed set (e.g. after a half-failed cold
 * start that never reached the daemon-start step).
 */
async function ensureLitestreamDaemonActive(
  auth: Authenticator,
  sandbox: SandboxResource,
  childLogger: typeof logger
): Promise<Result<void, Error>> {
  const activeResult = await sandbox.execRoot(
    auth,
    rootCommand.exec(SYSTEMCTL_BIN, [
      "is-active",
      "--quiet",
      LITESTREAM_UNIT_NAME,
    ]),
    { timeoutMs: PROBE_EXEC_TIMEOUT_MS }
  );
  if (activeResult.isErr()) {
    return activeResult;
  }
  if (activeResult.value.exitCode === 0) {
    return new Ok(undefined);
  }

  childLogger.warn({}, "Pod state: litestream daemon not active — starting it");
  return startLitestreamDaemon(auth, sandbox);
}

/**
 * Delete the pod's whole GCS state prefix. State objects are litestream LTX
 * files, never FileResources, so per-file deletion paths never touch them —
 * without this, deleting a pod leaks its replica chain forever.
 */
export async function deletePodStatePrefix(
  auth: Authenticator,
  space: SpaceResource
): Promise<Result<void, Error>> {
  try {
    await getPrivateUploadBucket().deleteByPrefix(
      getPodStateBasePath({
        workspaceId: auth.getNonNullableWorkspace().sId,
        podId: space.sId,
      })
    );
    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Delete ONE database's litestream replica: the GCS prefix the directory watcher keys on that
 * database's filename.
 *
 * The replica is the durable copy of a pod database, and `setupSandboxStateOnColdStart` restores every
 * replica it finds. So a replica that survives resurrects a database whose live files were deleted —
 * which makes this the step that actually makes a database deletion stick.
 *
 * Call it AFTER the live files are gone AND the daemon has been restarted (`restartLitestreamDaemon`):
 * a running litestream keeps replicating a database it can still see, and removing the files does not
 * make it let go — the directory watcher only enumerates at start, so until the restart the daemon
 * still holds the database and recreates the prefix this wipes. The delete is verified by re-listing,
 * because a silently-surviving replica is indistinguishable from success until the pod next boots.
 */
export async function deletePodDatabaseReplica(
  auth: Authenticator,
  space: SpaceResource,
  { database }: { database: string }
): Promise<Result<void, Error>> {
  if (!isValidPodDatabaseName(database)) {
    return new Err(new Error(`Invalid pod database name: '${database}'.`));
  }

  const statePrefix = getPodStateBasePath({
    workspaceId: auth.getNonNullableWorkspace().sId,
    podId: space.sId,
  });
  const replicaDirName = `${database}.db`;

  try {
    const bucket = getPrivateUploadBucket();
    await bucket.deleteByPrefix(`${statePrefix}${replicaDirName}/`);

    const remaining = await bucket.listSubdirectoryNames({
      prefix: statePrefix,
    });
    if (remaining.includes(replicaDirName)) {
      return new Err(
        new Error(
          `Replica of pod database '${database}' still present after deletion; ` +
            "the database would be restored on the pod's next cold start."
        )
      );
    }

    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}
