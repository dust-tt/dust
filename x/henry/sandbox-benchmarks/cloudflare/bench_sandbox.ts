/**
 * Benchmark Cloudflare Sandbox cold start latency.
 *
 * Pattern (same as Northflank benchmark):
 *   create sandbox -> retry exec until online -> delete sandbox
 *
 * This benchmark requires a deployed (or locally running) Worker harness that uses @cloudflare/sandbox.
 *
 * Run from repo root (requires front deps for tsx):
 *   cd front && CLOUDFLARE_SANDBOX_BENCH_URL=http://127.0.0.1:8787 \
 *     npx tsx ../x/henry/sandbox-benchmarks/cloudflare/bench_sandbox.ts [plan] [-n <runs>] [--no-delete-between-runs]
 *
 * Optional auth:
 *   CLOUDFLARE_SANDBOX_BENCH_TOKEN=...
 */

const HARD_TIMEOUT_MS = 60_000; // fail if not online
const EXEC_RETRY_DELAY_MS = 500;
const EXEC_ATTEMPT_TIMEOUT_MS = 5_000;

interface StepTiming {
  step: string;
  durationMs: number;
  error?: string;
}

interface BenchmarkRunResult {
  timings: StepTiming[];
  success: boolean;
  execAttempts: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printUsage(): void {
  console.log(`Usage:
  bench_sandbox.ts [plan] [-n <runs>] [--no-delete-between-runs]

Args:
  plan                      Cloudflare bench plan label (default: lite)

Options:
  -n, --runs <runs>         Number of runs (default: 1)
  --no-delete-between-runs  Don't delete sandboxes between runs; only cleanup at start/end
  -h, --help                Show this help
`);
}

function parsePositiveInt(argName: string, value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${argName} must be a positive integer, got "${value}"`);
  }
  return parsed;
}

function parseArgs(argv: string[]): {
  plan: string;
  runs: number;
  help: boolean;
  deleteBetweenRuns: boolean;
} {
  let plan: string | undefined;
  let runs = 1;
  let help = false;
  let deleteBetweenRuns = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }

    if (arg === "-n" || arg === "--runs") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      runs = parsePositiveInt(arg, value);
      i++;
      continue;
    }

    if (arg.startsWith("--runs=")) {
      runs = parsePositiveInt("--runs", arg.slice("--runs=".length));
      continue;
    }

    if (arg === "--no-delete-between-runs") {
      deleteBetweenRuns = false;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!plan) {
      plan = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return { plan: plan ?? "lite", runs, help, deleteBetweenRuns };
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  return value;
}

function jsonHeaders(token?: string): HeadersInit {
  if (token) {
    return { "content-type": "application/json", authorization: `Bearer ${token}` };
  }
  return { "content-type": "application/json" };
}

async function postJson<T>(
  baseUrl: string,
  token: string | undefined,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }

  return (await res.json()) as T;
}

async function cleanupCluster(baseUrl: string, token: string | undefined, plan: string) {
  console.log("Cleaning up existing resources...");
  await postJson(baseUrl, token, "/bench/cleanup", { plan });
  console.log("Cleanup done.\n");
}

async function runBenchmark(
  baseUrl: string,
  token: string | undefined,
  plan: string,
  options: { deleteSandboxAtEnd: boolean },
): Promise<BenchmarkRunResult> {
  const planShort = plan.replace(/^cf-/, "").replace(/^instance-/, "");
  const ts = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const sandboxId = `bench-${planShort}-${ts}`;
  const timings: StepTiming[] = [];

  function recordStep(step: string, startMs: number, error?: string): StepTiming {
    const timing = { step, durationMs: Date.now() - startMs, error };
    timings.push(timing);
    const status = error ? `FAILED: ${error}` : `${timing.durationMs}ms`;
    console.log(`  ${step.padEnd(22)} ${status}`);
    return timing;
  }

  async function cleanup() {
    await postJson(baseUrl, token, "/bench/delete", { plan, sandboxId }).catch(() => {});
  }

  let t0 = Date.now();
  try {
    await postJson(baseUrl, token, "/bench/create", { plan, sandboxId });
    recordStep("Create service", t0);
  } catch (err) {
    recordStep("Create service", t0, err instanceof Error ? err.message : String(err));
    if (options.deleteSandboxAtEnd) {
      await cleanup();
    }
    return { timings, success: false, execAttempts: 0 };
  }

  t0 = Date.now();
  type ExecReadyResponse = { ok: boolean; attempts: number; lastError?: string };

  try {
    const execResult = await postJson<ExecReadyResponse>(
      baseUrl,
      token,
      "/bench/exec-ready",
      {
        plan,
        sandboxId,
        hardTimeoutMs: HARD_TIMEOUT_MS,
        attemptTimeoutMs: EXEC_ATTEMPT_TIMEOUT_MS,
        retryDelayMs: EXEC_RETRY_DELAY_MS,
      },
    );

    if (!execResult.ok) {
      recordStep(
        "Exec readiness",
        t0,
        `${execResult.attempts} attempts in ${HARD_TIMEOUT_MS}ms — last: ${execResult.lastError ?? "no output"}`,
      );
      if (options.deleteSandboxAtEnd) {
        await cleanup();
      }
      return { timings, success: false, execAttempts: execResult.attempts };
    }

    recordStep("Exec readiness", t0);
    console.log(`    (${execResult.attempts} exec attempt(s))`);

    if (options.deleteSandboxAtEnd) {
      t0 = Date.now();
      await postJson(baseUrl, token, "/bench/delete", { plan, sandboxId }).catch(() => {});
      recordStep("Delete service", t0);
    }

    return { timings, success: true, execAttempts: execResult.attempts };
  } catch (err) {
    recordStep("Exec readiness", t0, err instanceof Error ? err.message : String(err));
    if (options.deleteSandboxAtEnd) {
      await cleanup();
    }
    return { timings, success: false, execAttempts: 0 };
  }
}

async function main() {
  const { plan, runs, help, deleteBetweenRuns } = parseArgs(process.argv.slice(2));
  if (help) {
    printUsage();
    return;
  }

  const baseUrl = getEnv("CLOUDFLARE_SANDBOX_BENCH_URL");
  if (!baseUrl) {
    throw new Error("CLOUDFLARE_SANDBOX_BENCH_URL env var is required");
  }
  const token = getEnv("CLOUDFLARE_SANDBOX_BENCH_TOKEN");

  console.log(`Plan: ${plan}`);
  console.log(`Runs: ${runs}`);
  console.log(`Delete between runs: ${deleteBetweenRuns ? "yes" : "no"}`);
  console.log(
    `Readiness: retry exec until success (hard timeout: ${HARD_TIMEOUT_MS}ms)` +
      ` (attempt timeout: ${EXEC_ATTEMPT_TIMEOUT_MS}ms, retry: ${EXEC_RETRY_DELAY_MS}ms)`,
  );
  console.log(
    `Pattern: create(1 sandbox) -> exec${deleteBetweenRuns ? " -> delete" : ""}\n`,
  );

  await cleanupCluster(baseUrl, token, plan);

  const results: BenchmarkRunResult[] = [];
  try {
    for (let i = 0; i < runs; i++) {
      const runLabel = runs === 1 ? "" : ` (${i + 1}/${runs})`;
      console.log(`--- Benchmark${runLabel}: ${plan} ---`);

      const result = await runBenchmark(baseUrl, token, plan, {
        deleteSandboxAtEnd: deleteBetweenRuns,
      });
      results.push(result);

      console.log();
      if (result.success) {
        const totalMs = result.timings.reduce((sum, t) => sum + t.durationMs, 0);
        console.log(`TOTAL: ${totalMs}ms`);
      } else {
        console.log("RESULT: FAILED");
        const failedStep = result.timings.find((t) => t.error);
        if (failedStep) {
          console.log(`  Failed at: ${failedStep.step}`);
          console.log(`  Error: ${failedStep.error}`);
        }
      }

      if (runs !== 1) {
        console.log();
      }
    }

    if (runs <= 1) {
      return;
    }

    const successfulResults = results.filter((r) => r.success);
    const failedRuns = results.length - successfulResults.length;

    console.log("=== Summary ===");
    console.log(
      `Runs: ${results.length} (success: ${successfulResults.length}, failed: ${failedRuns})`,
    );

    if (successfulResults.length === 0) {
      return;
    }

    const totalMsByRun = successfulResults.map((r) =>
      r.timings.reduce((sum, t) => sum + t.durationMs, 0),
    );
    const execAttemptsByRun = successfulResults.map((r) => r.execAttempts);

    console.log(
      `TOTAL (ms): avg=${mean(totalMsByRun).toFixed(1)} ` +
        `std=${stddev(totalMsByRun).toFixed(1)} ` +
        `min=${Math.min(...totalMsByRun)} ` +
        `max=${Math.max(...totalMsByRun)}`,
    );
    console.log(
      `EXEC attempts: avg=${mean(execAttemptsByRun).toFixed(2)} ` +
        `std=${stddev(execAttemptsByRun).toFixed(2)} ` +
        `min=${Math.min(...execAttemptsByRun)} ` +
        `max=${Math.max(...execAttemptsByRun)}`,
    );

    const stepNames = Array.from(
      new Set(successfulResults.flatMap((r) => r.timings.map((t) => t.step))),
    );

    for (const stepName of stepNames) {
      const stepDurationsMs = successfulResults
        .map((r) => r.timings.find((t) => t.step === stepName))
        .filter((t): t is StepTiming => t !== undefined && !t.error)
        .map((t) => t.durationMs);

      if (stepDurationsMs.length === 0) {
        continue;
      }

      console.log(
        `${stepName.padEnd(22)} ` +
          `avg=${mean(stepDurationsMs).toFixed(1)}ms ` +
          `std=${stddev(stepDurationsMs).toFixed(1)}ms ` +
          `min=${Math.min(...stepDurationsMs)}ms ` +
          `max=${Math.max(...stepDurationsMs)}ms ` +
          `(n=${stepDurationsMs.length})`,
      );
    }
  } finally {
    if (!deleteBetweenRuns) {
      console.log("\nCleaning up bench sandboxes...");
      await cleanupCluster(baseUrl, token, plan);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });

