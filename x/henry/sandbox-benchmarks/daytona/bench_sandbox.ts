/**
 * Benchmark Daytona Sandbox cold start latency.
 *
 * Pattern (same as Northflank/Cloudflare/E2B/Blaxel benchmark):
 *   create sandbox -> retry exec until online -> delete sandbox
 *
 * Run from repo root (requires front deps for tsx):
 *   npm --prefix x/henry/sandbox-benchmarks/daytona install
 *   cd front && DAYTONA_API_KEY=xxx DAYTONA_API_URL=https://app.daytona.io/api \
 *     npx tsx ../x/henry/sandbox-benchmarks/daytona/bench_sandbox.ts [target] [-n <runs>] [--no-delete-between-runs]
 */

const HARD_TIMEOUT_MS = 60_000; // fail if not online
const EXEC_RETRY_DELAY_MS = 500;
const EXEC_ATTEMPT_TIMEOUT_MS = 5_000;

const CREATE_TIMEOUT_SEC = 300;
const DELETE_TIMEOUT_SEC = 60;

const BENCHMARK_TAG = "sandbox-cold-start";
const PROVIDER_TAG = "daytona";

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

interface ExecuteResponse {
  exitCode: number;
  result: string;
  artifacts?: {
    stdout?: string;
  };
}

interface SandboxInstance {
  id: string;
  labels: Record<string, string>;
  process: {
    executeCommand(
      command: string,
      cwd?: string,
      env?: Record<string, string>,
      timeout?: number,
    ): Promise<ExecuteResponse>;
  };
  delete(timeout?: number): Promise<void>;
}

interface PaginatedSandboxes {
  items: SandboxInstance[];
  total: number;
  page: number;
  totalPages: number;
}

interface DaytonaClient {
  create(
    params?: {
      labels?: Record<string, string>;
      [key: string]: unknown;
    },
    options?: { timeout?: number },
  ): Promise<SandboxInstance>;
  list(
    labels?: Record<string, string>,
    page?: number,
    limit?: number,
  ): Promise<PaginatedSandboxes>;
  delete(sandbox: SandboxInstance, timeout?: number): Promise<void>;
}

interface DaytonaConstructor {
  new (config?: {
    apiKey?: string;
    apiUrl?: string;
    target?: string;
  }): DaytonaClient;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printUsage(): void {
  console.log(`Usage:
  bench_sandbox.ts [target] [-n <runs>] [--no-delete-between-runs]

Args:
  target                    Daytona target (default: auto)

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

  return { plan: plan ?? "auto", runs, help, deleteBetweenRuns };
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

function getRequiredEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`${name} env var is required`);
  }
  return value;
}

function sanitizePlan(plan: string): string {
  const normalized = plan
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!normalized) {
    return "auto";
  }
  return normalized.slice(0, 20);
}

function getCommandOutput(result: ExecuteResponse): string {
  return (result.artifacts?.stdout ?? result.result ?? "").trim();
}

async function loadDaytonaSdk(): Promise<DaytonaConstructor> {
  try {
    const mod = (await import("@daytonaio/sdk")) as {
      Daytona?: DaytonaConstructor;
    };
    if (!mod.Daytona) {
      throw new Error("module '@daytonaio/sdk' did not export Daytona");
    }
    return mod.Daytona;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load package "@daytonaio/sdk" (${reason}). ` +
        `Install it locally: npm --prefix x/henry/sandbox-benchmarks/daytona install`,
    );
  }
}

function createDaytonaClient(
  Daytona: DaytonaConstructor,
  options: { apiKey: string; apiUrl?: string; target?: string },
): DaytonaClient {
  const config: { apiKey: string; apiUrl?: string; target?: string } = {
    apiKey: options.apiKey,
  };

  if (options.apiUrl) {
    config.apiUrl = options.apiUrl;
  }

  if (options.target) {
    config.target = options.target;
  }

  return new Daytona(config);
}

async function listBenchSandboxes(daytona: DaytonaClient): Promise<SandboxInstance[]> {
  const list: SandboxInstance[] = [];
  const labels = {
    benchmark: BENCHMARK_TAG,
    provider: PROVIDER_TAG,
  };

  const pageSize = 100;
  let page = 1;

  while (true) {
    const result = await daytona.list(labels, page, pageSize);
    list.push(...result.items);

    if (result.items.length === 0 || result.page >= result.totalPages) {
      break;
    }

    page += 1;
  }

  return list;
}

async function cleanupCluster(daytona: DaytonaClient) {
  console.log("Cleaning up existing resources...");

  const sandboxes = await listBenchSandboxes(daytona);
  for (const sandbox of sandboxes) {
    console.log(`  Deleting sandbox: ${sandbox.id}`);
    await daytona.delete(sandbox, DELETE_TIMEOUT_SEC).catch(() => {});
  }

  console.log("Cleanup done.\n");
}

async function tryExec(
  sandbox: SandboxInstance,
  timeoutMs: number,
): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}> {
  const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
  try {
    const result = await sandbox.process.executeCommand(
      "echo i_am_online",
      undefined,
      undefined,
      timeoutSec,
    );

    const stdout = getCommandOutput(result);
    if (result.exitCode === 0 && stdout.includes("i_am_online")) {
      return { ok: true, stdout, stderr: "" };
    }

    return {
      ok: false,
      stdout,
      stderr: "",
      error: `exit=${result.exitCode}${stdout ? ` stdout=${JSON.stringify(stdout)}` : ""}`,
    };
  } catch (err) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runBenchmark(
  daytona: DaytonaClient,
  plan: string,
  options: { deleteSandboxAtEnd: boolean },
): Promise<BenchmarkRunResult> {
  const planShort = sanitizePlan(plan);
  const ts = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const benchTag = `bench-${planShort}-${ts}`;
  const timings: StepTiming[] = [];
  let sandbox: SandboxInstance | null = null;

  function recordStep(step: string, startMs: number, error?: string): StepTiming {
    const timing = { step, durationMs: Date.now() - startMs, error };
    timings.push(timing);
    const status = error ? `FAILED: ${error}` : `${timing.durationMs}ms`;
    console.log(`  ${step.padEnd(22)} ${status}`);
    return timing;
  }

  async function cleanup() {
    if (!sandbox) {
      return;
    }
    await sandbox.delete(DELETE_TIMEOUT_SEC).catch(() => {});
  }

  let t0 = Date.now();
  try {
    sandbox = await daytona.create(
      {
        labels: {
          benchmark: BENCHMARK_TAG,
          provider: PROVIDER_TAG,
          plan,
          run_id: benchTag,
        },
      },
      { timeout: CREATE_TIMEOUT_SEC },
    );
    recordStep("Create service", t0);
  } catch (err) {
    recordStep("Create service", t0, err instanceof Error ? err.message : String(err));
    if (options.deleteSandboxAtEnd) {
      await cleanup();
    }
    return { timings, success: false, execAttempts: 0 };
  }

  t0 = Date.now();
  const hardDeadline = Date.now() + HARD_TIMEOUT_MS;
  let execOk = false;
  let lastExecError = "";
  let attempts = 0;

  while (Date.now() < hardDeadline) {
    attempts++;
    const result = await tryExec(sandbox, EXEC_ATTEMPT_TIMEOUT_MS);

    if (result.ok && result.stdout.includes("i_am_online")) {
      execOk = true;
      break;
    }

    lastExecError = result.error ?? "no output";

    if (Date.now() < hardDeadline) {
      await sleep(EXEC_RETRY_DELAY_MS);
    }
  }

  if (!execOk) {
    recordStep(
      "Exec readiness",
      t0,
      `${attempts} attempts in ${HARD_TIMEOUT_MS}ms — last: ${lastExecError}`,
    );
    if (options.deleteSandboxAtEnd) {
      await cleanup();
    }
    return { timings, success: false, execAttempts: attempts };
  }

  recordStep("Exec readiness", t0);
  console.log(`    (${attempts} exec attempt(s))`);

  if (options.deleteSandboxAtEnd) {
    t0 = Date.now();
    await cleanup();
    recordStep("Delete service", t0);
  }

  return { timings, success: true, execAttempts: attempts };
}

async function main() {
  const { plan, runs, help, deleteBetweenRuns } = parseArgs(process.argv.slice(2));
  if (help) {
    printUsage();
    return;
  }

  const apiKey = getRequiredEnv("DAYTONA_API_KEY");
  const apiUrl = getEnv("DAYTONA_API_URL");
  const target = plan === "auto" ? undefined : plan;
  const Daytona = await loadDaytonaSdk();
  const daytona = createDaytonaClient(Daytona, {
    apiKey,
    apiUrl,
    target,
  });

  console.log(`Plan: ${plan}`);
  console.log(`Runs: ${runs}`);
  console.log(`Delete between runs: ${deleteBetweenRuns ? "yes" : "no"}`);
  if (apiUrl) {
    console.log(`API URL: ${apiUrl}`);
  }
  console.log(
    `Readiness: retry exec until success (hard timeout: ${HARD_TIMEOUT_MS}ms)` +
      ` (attempt timeout: ${EXEC_ATTEMPT_TIMEOUT_MS}ms, retry: ${EXEC_RETRY_DELAY_MS}ms)`,
  );
  console.log(
    `Pattern: create(1 sandbox, no volume) -> exec${deleteBetweenRuns ? " -> delete" : ""}\n`,
  );

  await cleanupCluster(daytona);

  const results: BenchmarkRunResult[] = [];
  try {
    for (let i = 0; i < runs; i++) {
      const runLabel = runs === 1 ? "" : ` (${i + 1}/${runs})`;
      console.log(`--- Benchmark${runLabel}: ${plan} ---`);

      const result = await runBenchmark(daytona, plan, {
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
      await cleanupCluster(daytona);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
