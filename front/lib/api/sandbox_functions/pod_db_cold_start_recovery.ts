import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system/types";
import { recordPodStateColdStartRecreate } from "@app/lib/api/sandbox/instrumentation";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import {
  podDatabasePrefixFromPodPath,
  resolvePodDatabaseName,
} from "@app/lib/api/sandbox_functions/db_naming";
import {
  listPodDatabases,
  reconcileDatabaseOnSandbox,
} from "@app/lib/api/sandbox_functions/dsbx_db_on_sandbox";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { POD_DATABASE_NAME_REGEX } from "@app/types/api/sandbox_functions";

/**
 * Cold-start recovery of expected-but-missing pod databases.
 *
 * The authoritative description of a pod's databases is its schema files (`<App>/databases/
 * {db}.db.ts`), which are GCS-durable pod files. The live SQLite files are only as durable as
 * their litestream replica — a replica lost before its first sync makes the next cold start skip
 * the database (see `restorePodDatabase`), and the sandbox then comes up "ready" with every
 * function using that database failing until someone re-runs a reconcile by hand.
 *
 * This pass runs at the end of pod-state bring-up, strictly AFTER the restore and the litestream
 * daemon start (so a recreated file replicates immediately): enumerate schema files under the pod
 * mount, compute the on-disk name each one is expected to produce, and re-run the reconcile for
 * any that is missing. Reconcile DDL is additive and idempotent, so the recreate is an EMPTY
 * database with the right schema — service is restored, data is not; the logs and metric say so
 * loudly.
 *
 * Everything here is best-effort by contract: a pod whose recovery fails must still come up
 * (functions not using the lost database keep working), so failures are logged and metered, never
 * propagated. This module is called from sandbox bring-up and must therefore never import the
 * sandbox lifecycle (`ensurePodSandboxReady`) — it operates on the sandbox it is handed.
 */

const SCHEMA_FILE_SUFFIX = ".db.ts";
const SCHEMA_FIND_TIMEOUT_MS = 15_000;
// Bounds on cold-start work. Recovery normally reconciles nothing; these caps keep a hostile or
// degenerate pod (thousands of schema files, every database missing) from stalling bring-up.
const MAX_SCHEMA_FILES = 200;
const MAX_RECREATED_DATABASES = 20;

export interface PodDatabaseRecoveryPlanEntry {
  /** The resolved on-disk database name expected to exist. */
  database: string;
  /** Absolute in-sandbox path of the schema file that declares it. */
  schemaFileSandboxPath: string;
}

/** The pod files gcsfuse mount point inside the sandbox (mirrors dust_file_system.ts). */
function podMountRoot(podId: string): string {
  return `/files/${SCOPED_PREFIX_POD}${podId}`;
}

/**
 * Decide which databases must be recreated, from raw `find` output over the pod mount and the
 * live database names. Pure so the resolution rules are testable without a sandbox.
 *
 * The find output is workload-influenced (pod files are model/user-written), so every line is
 * re-validated: exact `<App>/databases/{db}.db.ts` shape under the pod root, database-name
 * contract, resolvable app prefix. Name resolution mirrors the reconcile path
 * (`resolvePodDatabaseName`), so legacy bare-named databases still on disk satisfy an
 * app-prefixed schema file instead of triggering a duplicate prefixed recreate.
 */
export function planPodDatabaseRecovery({
  schemaFileFindOutput,
  podId,
  liveNames,
}: {
  schemaFileFindOutput: string;
  podId: string;
  liveNames: string[];
}): PodDatabaseRecoveryPlanEntry[] {
  const podRoot = `${podMountRoot(podId)}/`;
  const live = new Set(liveNames);
  const planned = new Map<string, PodDatabaseRecoveryPlanEntry>();

  const lines = schemaFileFindOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort()
    .slice(0, MAX_SCHEMA_FILES);

  for (const line of lines) {
    if (!line.startsWith(podRoot) || !line.endsWith(SCHEMA_FILE_SUFFIX)) {
      continue;
    }
    const relPath = line.slice(podRoot.length);
    const segments = relPath.split("/");
    // Only the documented convention: <App>/databases/{db}.db.ts.
    if (segments.length !== 3 || segments[1] !== "databases") {
      continue;
    }
    const name = segments[2].slice(0, -SCHEMA_FILE_SUFFIX.length);
    if (!POD_DATABASE_NAME_REGEX.test(name)) {
      continue;
    }

    const prefixResult = podDatabasePrefixFromPodPath({
      sourcePath: `${SCOPED_PREFIX_POD}${podId}/${relPath}`,
      podId,
    });
    if (prefixResult.isErr()) {
      continue;
    }

    const database = resolvePodDatabaseName({
      prefix: prefixResult.value,
      name,
      existingNames: liveNames,
    });
    if (live.has(database) || planned.has(database)) {
      continue;
    }
    planned.set(database, { database, schemaFileSandboxPath: line });
  }

  return [...planned.values()];
}

/**
 * Recreate expected-but-missing pod databases on a freshly cold-started sandbox. Best-effort by
 * contract (see the module doc): expected failures are logged and metered, never returned — a pod
 * must come up even when its recovery cannot run.
 *
 * No per-pod reconcile lock is taken: the DDL is additive and idempotent, and a concurrent tool
 * reconcile either creates the database first (this one becomes a no-op) or briefly contends on
 * SQLite's busy timeout, in which case the loser is logged and the next cold start retries.
 */
export async function recoverMissingPodDatabasesOnColdStart(
  auth: Authenticator,
  { sandbox, podId }: { sandbox: SandboxResource; podId: string }
): Promise<void> {
  const startMs = performance.now();
  const childLogger = logger.child({
    sandboxId: sandbox.sId,
    workspaceId: auth.getNonNullableWorkspace().sId,
    podId,
  });

  const liveResult = await listPodDatabases(auth, { sandbox });
  if (liveResult.isErr()) {
    childLogger.error(
      { err: liveResult.error },
      "Pod DB cold-start recovery: listing live databases failed — skipping recovery"
    );
    return;
  }
  const liveNames = liveResult.value.map((entry) => entry.name);

  // Enumerate schema files as agent-proxied (pod files are workload-readable; output is
  // re-validated in planPodDatabaseRecovery). Depth is pinned to the documented
  // <App>/databases/{db}.db.ts layout.
  const findResult = await sandbox.exec(
    auth,
    `/usr/bin/find ${shellEscape(podMountRoot(podId))} -mindepth 3 -maxdepth 3 -type f -path ${shellEscape(`*/databases/*${SCHEMA_FILE_SUFFIX}`)}`,
    { user: "agent-proxied", timeoutMs: SCHEMA_FIND_TIMEOUT_MS }
  );
  if (findResult.isErr() || findResult.value.exitCode !== 0) {
    childLogger.error(
      {
        err: findResult.isErr() ? findResult.error : undefined,
        stderr: findResult.isOk() ? findResult.value.stderr : undefined,
      },
      "Pod DB cold-start recovery: schema file enumeration failed — skipping recovery"
    );
    return;
  }

  const plan = planPodDatabaseRecovery({
    schemaFileFindOutput: findResult.value.stdout,
    podId,
    liveNames,
  });
  if (plan.length === 0) {
    childLogger.info(
      { durationMs: Math.round(performance.now() - startMs) },
      "Pod DB cold-start recovery: all expected databases present"
    );
    return;
  }

  const bounded = plan.slice(0, MAX_RECREATED_DATABASES);
  if (bounded.length < plan.length) {
    childLogger.error(
      { planned: plan.length, cap: MAX_RECREATED_DATABASES },
      "Pod DB cold-start recovery: more missing databases than the per-cold-start cap — the rest will be retried on the next cold start"
    );
  }

  let recreated = 0;
  for (const entry of bounded) {
    const entryStartMs = performance.now();
    const result = await reconcileDatabaseOnSandbox(auth, {
      sandbox,
      podId,
      database: entry.database,
      schemaFileSandboxPath: entry.schemaFileSandboxPath,
    });
    if (result.isErr()) {
      childLogger.error(
        {
          database: entry.database,
          schemaFileSandboxPath: entry.schemaFileSandboxPath,
          err: result.error,
        },
        "Pod DB cold-start recovery: recreate failed — functions using this database will fail until a manual reconcile"
      );
      continue;
    }
    recreated += 1;
    recordPodStateColdStartRecreate();
    // error level on purpose: a recreate means the pod lost this database's data.
    childLogger.error(
      {
        database: entry.database,
        schemaFileSandboxPath: entry.schemaFileSandboxPath,
        replicationWarning: result.value.replicationWarning,
        durationMs: Math.round(performance.now() - entryStartMs),
      },
      "Pod DB cold-start recovery: expected database was missing — recreated EMPTY from its schema file; previously stored data was NOT recovered"
    );
  }

  childLogger.info(
    {
      recreated,
      planned: plan.length,
      durationMs: Math.round(performance.now() - startMs),
    },
    "Pod DB cold-start recovery: done"
  );
}
