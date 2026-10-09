// How the orchestrator mounts each implementation inside a sandbox. Everything else (sandboxes,
// workloads, results) is shared.

export interface MountSpec {
  // Local path of the client binary, uploaded to every sandbox.
  binaryPath: string;
  // Directory under the mount point rounds write in ("" for the mount's root).
  workDir: string;
  // Shell command (run as root) that mounts at `mountPoint` and stays in the foreground.
  command: (binary: string, mountPoint: string) => string;
  envs: Record<string, string>;
  // Printed on the client's stdout or stderr once the mount serves requests.
  readyMarker: string;
  // The client's totals, from its stderr lines after SIGTERM; null when it printed none.
  totals: (logLines: string[]) => Record<string, unknown> | null;
  // Whether those totals show a clean run (nothing dropped, writes drained).
  healthy: (totals: Record<string, unknown> | null) => boolean;
  // The freshness budget the mount ran with, recorded with every result.
  budget: (totals: Record<string, unknown> | null) => unknown;
  /**
   * @cc [owner:fontanierh,label:testing] commit-delays
   * Every implementation MUST report, from its own totals, the max over committed writes of: the
   * client-only delay (write acknowledged to its commit sent), the commit RPC (sent to outcome,
   * network and storage included) and the end-to-end lag (acknowledged to outcome). A value the
   * client did not report MUST be null, never 0.
   */
  commitDelays: (totals: Record<string, unknown> | null) => CommitDelays;
}

export interface CommitDelays {
  client_max_ms: number | null;
  rpc_max_ms: number | null;
  end_to_end_max_ms: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

// Cache budget both clients are configured with; the cgroup they run in (bench.ts) allows 20% more.
export const CLIENT_CACHE_MIB = 512;

function jsonLines(lines: string[]): Record<string, any>[] {
  return lines.flatMap((line) => {
    try {
      const row = JSON.parse(line);
      return row && typeof row === "object" ? [row] : [];
    } catch {
      return [];
    }
  });
}

// Henry's dfs-mount: 1 s budget via --max-delay-ms, --cache-mib bounds cached file content (not
// listings, attributes or pending writes). Totals in a "mount totals" log line.
export function henryImpl(endpoint: string, token: string, buildDir: string): MountSpec {
  return {
    binaryPath: `${buildDir}/dfs-mount`,
    workDir: "",
    command: (binary, mountPoint) =>
      `exec ${binary} --addr ${endpoint} --max-delay-ms 1000 --cache-mib ${CLIENT_CACHE_MIB} ${mountPoint}`,
    envs: { DFS_TOKEN: token, RUST_LOG: "info" },
    readyMarker: "mounted",
    totals: (lines) => {
      const row = jsonLines(lines)
        .filter((r) => r.message === "mount totals" || r.fields?.message === "mount totals")
        .pop();
      return row?.fields ?? row ?? null;
    },
    // A late commit is not a failure: its delays are reported by commitDelays.
    healthy: (totals) => (totals as { commit?: { dropped_ops?: number } } | null)?.commit?.dropped_ops === 0,
    budget: (totals) => (totals as { budget?: unknown } | null)?.budget ?? null,
    // Per op, timed from its acknowledgement; the RPC is per batch.
    commitDelays: (totals) => {
      const commit = (totals?.commit ?? {}) as Record<string, unknown>;
      // No commit: the maxima stay at their zero default, which is not a measurement.
      if (!commit.ops) {
        return { client_max_ms: null, rpc_max_ms: null, end_to_end_max_ms: null };
      }
      return {
        client_max_ms: num(commit.max_send_delay_ms),
        rpc_max_ms: num(commit.max_apply_ms),
        end_to_end_max_ms: num(commit.max_lag_ms),
      };
    },
  };
}

// spolu's dfs-fuse at the 1 s budget, its default: cache TTL 800 ms + max write delay 200 ms (it
// refuses more). Metrics and drain outcome come as JSON lines on stderr at exit. fsync of a directory
// flushes only that directory's pending writes, so its drain time is not a full barrier like Henry's.
// --cache-mib is its whole accounted budget, a 96 MiB I/O reserve included.
export function spoluImpl(endpoint: string, sessionKey: string, buildDir: string): MountSpec {
  return {
    binaryPath: `${buildDir}/dfs-fuse`,
    // Created by impls/spolu/deploy: the mount's root is a read-only projection.
    workDir: "bench",
    command: (binary, mountPoint) =>
      `umask 077 && printf %s "$DFS_SESSION_KEY" >/tmp/dfs-session.key && ` +
      `exec ${binary} --endpoint ${endpoint} --session-key-file /tmp/dfs-session.key ` +
      `--cache-ttl-ms 800 --max-write-delay-ms 200 --cache-mib ${CLIENT_CACHE_MIB} ${mountPoint}`,
    envs: { DFS_SESSION_KEY: sessionKey, RUST_LOG: "info" },
    readyMarker: "dfs-fuse: mounted",
    totals: (lines) => {
      const rows = jsonLines(lines);
      const drain = rows.filter((r) => "client_drain_ms" in r).pop();
      const metrics = rows.filter((r) => "dfs_client_metrics" in r).pop();
      return drain || metrics ? { drain: drain ?? null, ...(metrics ?? {}) } : null;
    },
    healthy: (totals) => (totals?.drain as { failed?: boolean } | null)?.failed === false,
    budget: () => ({ cache_ttl_ms: 800, max_write_delay_ms: 200, cache_mib: CLIENT_CACHE_MIB }),
    // Contract v5-commit-delay-metrics (x/spolu/dfs/v5/CONTRACTS): per mutation group, timed from
    // its first edit's acceptance.
    commitDelays: (totals) => {
      const metrics = (totals?.dfs_client_metrics ?? {}) as Record<string, { max_ms?: unknown }>;
      return {
        client_max_ms: num(metrics["writeback.client_delay"]?.max_ms),
        rpc_max_ms: num(metrics["writeback.group"]?.max_ms),
        end_to_end_max_ms: num(metrics["writeback.lag"]?.max_ms),
      };
    },
  };
}
