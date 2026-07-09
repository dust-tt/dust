import { getPodStateBasePath } from "@app/lib/api/files/mount_path";
import { traceSandboxStartupPhase } from "@app/lib/api/sandbox/instrumentation";
import {
  type RootCommand,
  type RootCommandArg,
  rootCommand,
} from "@app/lib/api/sandbox/root_command";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Pod state runtime plumbing: SQLite databases under /pod-state/databases,
 * continuously replicated by a litestream daemon (running as dust-state) to a
 * gcsfuse-mounted GCS prefix at /pod-state/replica.
 *
 * The daemon runs litestream's directory watcher over /pod-state/databases
 * (static /etc/litestream.yml baked at image build): databases created at any
 * point — including publish-time `dsbx db reconcile` — are discovered and
 * replicated automatically within seconds. Replica subdirectories are named
 * by database FILENAME: /pod-state/replica/{db}.db/ltx/...
 *
 * Lifecycle:
 *  - Cold start (`setupPodStateOnColdStart`, after the gcsfuse mounts): restore
 *    each replicated database (temp file + PRAGMA quick_check + atomic rename),
 *    then start the litestream systemd unit — strictly in that order, so the
 *    watcher never manages files mid-restore or writes to an unmounted
 *    replica dir.
 *  - Wake from pause needs nothing: the Firecracker snapshot preserves the
 *    daemon, its control socket, the mounts and the database files.
 */

export const POD_STATE_DATABASES_DIR = "/pod-state/databases";
export const POD_STATE_REPLICA_DIR = "/pod-state/replica";
/** In-sandbox mount point of the state replica gcsfuse mount. */
export const POD_STATE_REPLICA_MOUNT_POINT = POD_STATE_REPLICA_DIR;
/** System user running the litestream daemon and owning the replica mount. */
export const POD_STATE_USER = "dust-state";

const LITESTREAM_BIN = "/opt/bin/litestream";
const LITESTREAM_UNIT_NAME = "litestream";

const RUNUSER_BIN = "/usr/sbin/runuser";
const SYSTEMCTL_BIN = "/usr/bin/systemctl";
const SQLITE3_BIN = "/usr/bin/sqlite3";
const FIND_BIN = "/usr/bin/find";
const MV_BIN = "/usr/bin/mv";
const RM_BIN = "/usr/bin/rm";
const CHMOD_BIN = "/usr/bin/chmod";
const TEST_BIN = "/usr/bin/test";

// Database name shape. Doubles as an allowlist: enumeration outputs are
// workload-influenced, so anything not matching (dotfiles, litestream sidecar
// dirs, hostile names) is skipped.
const POD_DATABASE_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// Cheap probes and file operations stay tightly bounded.
const PROBE_EXEC_TIMEOUT_MS = 10_000;
// Cold-start restore may pull a large snapshot + LTX chain through gcsfuse.
const RESTORE_EXEC_TIMEOUT_MS = 120_000;

export function isValidPodDatabaseName(name: string): boolean {
  return POD_DATABASE_NAME_REGEX.test(name);
}

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
    .filter(isValidPodDatabaseName)
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
    .filter(isValidPodDatabaseName)
    .sort();
}

function parseFindBasenames(findOutput: string): string[] {
  return findOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.slice(line.lastIndexOf("/") + 1));
}

/**
 * Run a command as dust-state. Everything touching the replica mount must run
 * as dust-state: the mount has no allow_other, so even root is denied by the
 * FUSE layer.
 */
function asPodStateUser(
  executable: string,
  args: readonly RootCommandArg[]
): RootCommand {
  if (!executable.startsWith("/")) {
    throw new Error(
      `pod-state command executable must be absolute: ${executable}`
    );
  }
  return rootCommand.exec(RUNUSER_BIN, [
    "-u",
    POD_STATE_USER,
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
export async function setupPodStateOnColdStart(
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
        "Pod state cold start: replica enumeration failed"
      );
      return namesResult;
    }
    const names = namesResult.value;

    // 2. Restore each database: temp file + quick_check + atomic rename.
    for (const name of names) {
      const restoreResult = await traceSandboxStartupPhase(
        "pod_state.restore_db",
        () => restorePodDatabase(auth, sandbox, name),
        { database: name }
      );
      if (restoreResult.isErr()) {
        childLogger.error(
          { err: restoreResult.error, database: name },
          "Pod state cold start: database restore failed"
        );
        return restoreResult;
      }
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
        "Pod state cold start: litestream daemon start failed"
      );
      return startResult;
    }

    childLogger.info(
      { databases: names },
      "Pod state cold start: restore complete, litestream started"
    );
    return new Ok(undefined);
  });
}

async function listReplicaDatabases(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<string[], Error>> {
  const result = await sandbox.execRoot(
    auth,
    asPodStateUser(FIND_BIN, [
      POD_STATE_REPLICA_DIR,
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
    return new Err(execFailure("pod state replica enumeration", result.value));
  }
  return new Ok(parseReplicaDatabaseNames(result.value.stdout));
}

async function restorePodDatabase(
  auth: Authenticator,
  sandbox: SandboxResource,
  name: string
): Promise<Result<void, Error>> {
  const dbPath = `${POD_STATE_DATABASES_DIR}/${name}.db`;
  const tmpPath = `${POD_STATE_DATABASES_DIR}/.restore-${name}.db`;
  // Replica subdir named by database FILENAME (directory watcher layout).
  const replicaUrl = `file://${POD_STATE_REPLICA_DIR}/${name}.db`;

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
    asPodStateUser(LITESTREAM_BIN, [
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
      "Pod state cold start: replica directory has no restorable backup — skipping database"
    );
    return new Ok(undefined);
  }

  // Integrity gate: corrupt LTX chains fail the restore itself loudly, but
  // quick_check also catches page-level corruption that slipped through.
  const checkResult = await sandbox.execRoot(
    auth,
    asPodStateUser(SQLITE3_BIN, ["--", tmpPath, "PRAGMA quick_check;"]),
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
