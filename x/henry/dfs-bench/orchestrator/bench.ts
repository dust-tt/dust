// Runs one benchmark round against an implementation deployed on a bench cluster. Invoked by
// bin/bench, which sets DFS_BENCH_STATE, RUN_ID, IMPL and the E2B / kubectl environment.
//
// Scenario `basic` (2 sandboxes, A and B, same tenant, in a new directory per round):
//   0. Both time round trips to the in-cluster echo service: the network floor of an RPC.
//   1. A untars a corpus into the mount (jd's by default), then drains its writeback.
//   2. B reads the whole tree back through its own mount and compares digests with A's native copy.
//   3. Freshness: A creates files, B polls for them; latency vs the 1 s bound.
// A round is valid only if every mount exits cleanly with no dropped ops and no missed windows.

import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { Sandbox } from "e2b";

import { henryImpl, type MountSpec } from "./impls.ts";

const TEMPLATE = "base";
// Sandboxes are not reaped by our infra: short timeout, renewed while this process lives, hard cap.
const SANDBOX_TIMEOUT_MS = 15 * 60_000;
const RENEW_EVERY_MS = 5 * 60_000;
const MAX_ROUND_MS = 3 * 3600_000;
const MOUNT_POINT = "/mnt/dfs";
const BINARY = "/usr/local/bin/dfs-client";
const WORKLOAD = "/opt/fsbench.py";
const JD_GENERATE = "/opt/jd_generate.py";
const CORPUS = process.env.BENCH_CORPUS ?? "jd";
const FILES = Number(process.env.BENCH_FILES ?? "10000");
const FRESH_COUNT = Number(process.env.BENCH_FRESH_COUNT ?? "50");

const stateDir = required("DFS_BENCH_STATE");
const runId = required("RUN_ID");
const implName = required("IMPL");
const scenario = required("SCENARIO");
const echoEndpoint = required("ECHO_ENDPOINT");
const benchDir = new URL("..", import.meta.url).pathname;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function log(message: string): void {
  process.stderr.write(`[${new Date().toISOString().slice(11, 19)}] ${message}\n`);
}

function loadImpl(): { mount: MountSpec; image: string; endpoint: string } {
  switch (implName) {
    case "henry": {
      const deployDir = `${stateDir}/runs/${runId}/henry`;
      const buildDir = `${stateDir}/impls/henry/latest`;
      const endpoint = readFileSync(`${deployDir}/endpoint`, "utf8").trim();
      const tenant = JSON.parse(readFileSync(`${deployDir}/tenant.json`, "utf8"));
      return {
        mount: henryImpl(endpoint, tenant.tokens.bench, buildDir),
        image: readFileSync(`${buildDir}/image`, "utf8").trim(),
        endpoint,
      };
    }
    default:
      throw new Error(`unknown impl ${implName}`);
  }
}

async function root(sandbox: Sandbox, command: string, timeoutMs = 10 * 60_000): Promise<string> {
  const result = await sandbox.commands.run(command, { user: "root", timeoutMs });
  return result.stdout;
}

async function workload(sandbox: Sandbox, args: string): Promise<Record<string, unknown>> {
  const stdout = await root(sandbox, `python3 ${WORKLOAD} ${args}`, 60 * 60_000);
  return JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
}

// FDB's own view while a workload runs: `status json` every 2 s through kubectl (bin/bench set
// KUBECONFIG). Keeps the worst values seen and every `performance_limited_by` reason.
interface FdbSample {
  latency_probe?: Record<string, number>;
  qos?: {
    performance_limited_by?: { name?: string };
    worst_queue_bytes_storage_server?: number;
    worst_queue_bytes_log_server?: number;
    worst_durability_lag_storage_server?: { seconds?: number };
  };
}

async function fdbStatus(): Promise<FdbSample> {
  const pods = await promisify(execFile)("kubectl", [
    "-n", "fdb", "get", "pod", "-l", "foundationdb.org/fdb-process-class=stateless", "-o", "name",
  ]);
  const pod = pods.stdout.trim().split("\n")[0];
  const status = await promisify(execFile)(
    "kubectl",
    ["-n", "fdb", "exec", pod, "-c", "foundationdb", "--", "fdbcli", "-C", "/var/dynamic-conf/fdb.cluster",
      "--exec", "status json", "--timeout", "10"],
    { maxBuffer: 64 << 20 }
  );
  return (JSON.parse(status.stdout) as { cluster: FdbSample }).cluster;
}

function sampleFdb(): () => Promise<Record<string, unknown>> {
  const samples: FdbSample[] = [];
  let running = true;
  const loop = (async () => {
    while (running) {
      const started = Date.now();
      try {
        samples.push(await fdbStatus());
      } catch (error) {
        log(`fdb status failed: ${String(error).slice(0, 200)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 2000 - (Date.now() - started))));
    }
  })();
  return async () => {
    running = false;
    await loop;
    const max = (pick: (s: FdbSample) => number | undefined) =>
      Math.max(0, ...samples.map(pick).filter((v): v is number => typeof v === "number"));
    return {
      samples: samples.length,
      limited_by: [...new Set(samples.map((s) => s.qos?.performance_limited_by?.name).filter(Boolean))],
      max_commit_probe_seconds: max((s) => s.latency_probe?.commit_seconds),
      max_grv_probe_seconds: max((s) => s.latency_probe?.transaction_start_seconds),
      max_log_queue_bytes: max((s) => s.qos?.worst_queue_bytes_log_server),
      max_storage_queue_bytes: max((s) => s.qos?.worst_queue_bytes_storage_server),
      max_storage_durability_lag_seconds: max((s) => s.qos?.worst_durability_lag_storage_server?.seconds),
    };
  };
}

interface Mounted {
  sandbox: Sandbox;
  pid: number;
  done: Promise<unknown>;
}

async function mount(sandbox: Sandbox, spec: MountSpec): Promise<Mounted> {
  await root(sandbox, `mkdir -p ${MOUNT_POINT}`);
  const handle = await sandbox.commands.run(
    `${spec.command(BINARY, MOUNT_POINT)} >/tmp/mount.out 2>/tmp/mount.log`,
    { user: "root", background: true, envs: spec.envs, timeoutMs: 0 }
  );
  const done = handle.wait().catch((error: unknown) => error);
  await root(
    sandbox,
    `for i in $(seq 300); do grep -q '${spec.readyMarker}' /tmp/mount.out && exit 0; sleep 0.2; done; tail -20 /tmp/mount.log; exit 1`
  );
  return { sandbox, pid: handle.pid, done };
}

async function unmount(mounted: Mounted, spec: MountSpec): Promise<Record<string, unknown>> {
  await root(mounted.sandbox, `kill -TERM ${mounted.pid}`);
  const outcome = await mounted.done;
  const exitCode =
    outcome && typeof outcome === "object" && "exitCode" in outcome ? Number(outcome.exitCode) : null;
  const logLines = (await root(mounted.sandbox, "cat /tmp/mount.log")).split("\n");
  const totals = logLines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((row) => row && (row.message === spec.totalsMessage || row.fields?.message === spec.totalsMessage))
    .pop();
  return { sandbox: mounted.sandbox.sandboxId, exitCode, totals: totals ?? null };
}

function cleanCommit(result: Record<string, unknown>): boolean {
  const totals = result.totals as { commit?: { dropped_ops?: number; missed_windows?: number }; fields?: { commit?: { dropped_ops?: number; missed_windows?: number } } } | null;
  const commit = totals?.commit ?? totals?.fields?.commit;
  return result.exitCode === 0 && commit?.dropped_ops === 0 && commit?.missed_windows === 0;
}

async function main(): Promise<void> {
  if (scenario !== "basic") {
    throw new Error(`unknown scenario ${scenario}`);
  }
  if (CORPUS !== "jd" && CORPUS !== "scatter") {
    throw new Error(`unknown corpus ${CORPUS}`);
  }
  const impl = loadImpl();
  const startedAt = new Date();
  const roundDir = `${MOUNT_POINT}/rounds/${startedAt.toISOString().replace(/[:.]/g, "-")}`;
  log(`run ${runId}: ${implName} at ${impl.endpoint}, scenario ${scenario}, ${CORPUS} corpus`);

  const sandboxes = await Promise.all(
    ["a", "b"].map(() =>
      Sandbox.create(TEMPLATE, {
        timeoutMs: SANDBOX_TIMEOUT_MS,
        metadata: { "dfs-bench": "true", "dfs-bench-run": runId },
      })
    )
  );
  const renew = setInterval(() => {
    if (Date.now() - startedAt.getTime() > MAX_ROUND_MS) {
      log("round exceeded its hard cap, no longer renewing sandboxes");
      clearInterval(renew);
      return;
    }
    for (const sandbox of sandboxes) {
      sandbox.setTimeout(SANDBOX_TIMEOUT_MS).catch((error: unknown) => log(`renew failed: ${String(error)}`));
    }
  }, RENEW_EVERY_MS);

  try {
    const [a, b] = sandboxes;
    log(`sandboxes ${a.sandboxId} ${b.sandboxId}`);

    const binary = new Blob([readFileSync(impl.mount.binaryPath)]);
    const script = readFileSync(`${benchDir}/workloads/fsbench.py`, "utf8");
    const generator = readFileSync(`${benchDir}/../../jd/filesystem-benchmark/generate.py`, "utf8");
    await Promise.all(
      sandboxes.map(async (s) => {
        await s.files.write("/tmp/dfs-client", binary);
        await s.files.write("/tmp/fsbench.py", script);
        await s.files.write("/tmp/jd_generate.py", generator);
        await root(
          s,
          `install -m 755 /tmp/dfs-client ${BINARY} && install -m 644 /tmp/fsbench.py ${WORKLOAD} && install -m 644 /tmp/jd_generate.py ${JD_GENERATE}`
        );
      })
    );

    const network = await Promise.all(sandboxes.map((s) => workload(s, `rtt --addr ${echoEndpoint}`)));
    log(
      `echo rtt p50 ${network.map((n) => Number(n.p50_ms).toFixed(2)).join(" / ")} ms, ` +
        `throughput ${network.map((n) => Number(n.echo_mb_per_second).toFixed(0)).join(" / ")} MB/s`
    );

    const mounts = await Promise.all(sandboxes.map((s) => mount(s, impl.mount)));
    log("mounted on both sandboxes");

    const corpus = await workload(a, `corpus --kind ${CORPUS} --out /tmp/corpus.tar --files ${FILES}`);
    log(`corpus ${corpus.kind}: ${corpus.files} files, ${(Number(corpus.bytes) / 1e6).toFixed(0)} MB`);
    const idleFdb = await fdbStatus();
    const stopSampling = sampleFdb();
    const untar = await workload(a, `untar --archive /tmp/corpus.tar --target ${roundDir}/untar`);
    const untarFdb = await stopSampling();
    log(`fdb during untar: ${JSON.stringify(untarFdb)}`);
    log(`untar ${Number(untar.untar_seconds).toFixed(2)}s (+${Number(untar.drain_seconds).toFixed(2)}s drain)`);

    await new Promise((resolve) => setTimeout(resolve, 1500));
    const readBack = await workload(b, `digest --root ${roundDir}/untar`);
    const validated = readBack.digest === untar.native_digest;
    log(`read back on B ${Number(readBack.seconds).toFixed(2)}s, ${validated ? "matches" : "DIFFERS"}`);

    const freshDir = `${roundDir}/fresh`;
    let readerReady: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      readerReady = resolve;
    });
    const reader = await b.commands.run(`python3 ${WORKLOAD} fresh-read --dir ${freshDir} --count ${FRESH_COUNT}`, {
      user: "root",
      background: true,
      timeoutMs: 5 * 60_000,
      onStderr: (data) => {
        if (data.includes("ready")) {
          readerReady();
        }
      },
    });
    await ready;
    await workload(a, `fresh-write --dir ${freshDir} --count ${FRESH_COUNT}`);
    const freshness = JSON.parse((await reader.wait()).stdout.trim());
    log(`freshness p50 ${freshness.p50_seconds?.toFixed(3)}s p95 ${freshness.p95_seconds?.toFixed(3)}s max ${freshness.max_seconds?.toFixed(3)}s`);

    const clients = await Promise.all(mounts.map((m) => unmount(m, impl.mount)));
    const valid = validated && freshness.seen === FRESH_COUNT && clients.every(cleanCommit);

    const result = {
      run_id: runId,
      impl: implName,
      scenario,
      round_dir: roundDir,
      image: impl.image,
      endpoint: impl.endpoint,
      template: TEMPLATE,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      valid,
      budget: (clients[0]?.totals as { budget?: unknown } | null)?.budget ?? null,
      network,
      corpus,
      fdb: { idle_latency_probe: idleFdb.latency_probe ?? null, during_untar: untarFdb },
      untar,
      read_back: { ...readBack, validated },
      freshness,
      clients,
    };
    const outDir = `${stateDir}/results/${runId}`;
    mkdirSync(outDir, { recursive: true });
    const outPath = `${outDir}/${startedAt.toISOString().replace(/[:.]/g, "-")}-${implName}.json`;
    writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
    log(`${valid ? "valid" : "INVALID"} round, results in ${outPath}`);
    process.stdout.write(`${outPath}\n`);
  } finally {
    clearInterval(renew);
    await Promise.all(sandboxes.map((s) => s.kill().catch(() => undefined)));
  }
}

await main();
