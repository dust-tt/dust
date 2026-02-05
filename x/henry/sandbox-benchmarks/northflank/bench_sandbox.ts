/**
 * Benchmark sandbox cold start latency.
 *
 * Pattern:
 *   create service (instances=1, no volume) -> retry exec until online
 *
 * Run from repo root (requires front deps):
 *   cd front && NORTHFLANK_API_TOKEN=xxx npx tsx ../x/henry/sandbox-benchmarks/northflank/bench_sandbox.ts [plan] [-n <runs>] [--no-delete-between-runs]
 */

import {
  ApiClient,
  ApiClientInMemoryContextProvider,
  ExecCommandStandard,
} from "@northflank/js-client";
import https from "https";

const HARD_TIMEOUT_MS = 60_000; // fail if not online
const EXEC_RETRY_DELAY_MS = 500;
const EXEC_ATTEMPT_TIMEOUT_MS = 5_000;

const httpsAgent = new https.Agent({ keepAlive: true });

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

interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printUsage(): void {
  console.log(`Usage:
  bench_sandbox.ts [plan] [-n <runs>] [--no-delete-between-runs]

Args:
  plan                      Northflank deployment plan (default: nf-compute-20)

Options:
  -n, --runs <runs>         Number of runs (default: 1)
  --no-delete-between-runs  Don't delete services between runs; only cleanup at start/end
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

  return { plan: plan ?? "nf-compute-20", runs, help, deleteBetweenRuns };
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

async function tryExec(
  baseUrl: string,
  token: string,
  projectId: string,
  serviceId: string,
  command: string[],
  timeoutMs: number,
): Promise<ExecResult> {
  return new Promise<ExecResult>((resolve) => {
    let settled = false;
    const finish = (result: ExecResult) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      finish({ ok: false, stdout: "", stderr: "", error: "exec timeout" });
    }, timeoutMs);

    try {
      const session = new ExecCommandStandard(
        baseUrl,
        {
          projectId,
          entityType: "service",
          entityId: serviceId,
          command,
          shell: "none",
          encoding: "utf-8",
        },
        token,
        httpsAgent,
      );

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      session.stdOut.on("data", (chunk: unknown) => {
        stdoutChunks.push(
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(String(chunk), "utf-8"),
        );
      });
      session.stdErr.on("data", (chunk: unknown) => {
        stderrChunks.push(
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(String(chunk), "utf-8"),
        );
      });

      session.once("error", (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        finish({ ok: false, stdout: "", stderr: "", error: msg });
      });

      session.start().then(
        (result) => {
          const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
          const stderr = Buffer.concat(stderrChunks).toString("utf-8");

          if (result.status === "Success" && result.exitCode === 0) {
            finish({ ok: true, stdout, stderr });
          } else {
            finish({
              ok: false,
              stdout,
              stderr,
              error: `status=${result.status} exit=${result.exitCode} msg=${result.message ?? ""}`,
            });
          }
        },
        (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          finish({ ok: false, stdout: "", stderr: "", error: msg });
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      finish({ ok: false, stdout: "", stderr: "", error: msg });
    }
  });
}

async function cleanupCluster(api: ApiClient, projectId: string) {
  console.log("Cleaning up existing resources...");

  const svcRes = await api.list.services({ parameters: { projectId } });
  const services = svcRes.data?.services ?? [];
  for (const svc of services) {
    if (svc.id.startsWith("bench-")) {
      console.log(`  Deleting service: ${svc.id}`);
      await api.delete
        .service({ parameters: { projectId, serviceId: svc.id } })
        .catch(() => {});
    }
  }

  console.log("Cleanup done.\n");
}

async function runBenchmark(
  api: ApiClient,
  projectId: string,
  plan: string,
  options: { deleteServiceAtEnd: boolean },
): Promise<BenchmarkRunResult> {
  const planShort = plan.replace("nf-compute-", "c");
  const ts = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const serviceId = `bench-${planShort}-${ts}`;
  const timings: StepTiming[] = [];

  const baseUrl = api.contextProvider.getCurrentBaseUrl(true);
  const token = api.contextProvider.getCurrentToken();
  if (!baseUrl) {
    throw new Error("Northflank base URL not configured in context provider");
  }
  if (!token) {
    throw new Error("Northflank token not configured in context provider");
  }

  function recordStep(step: string, startMs: number, error?: string): StepTiming {
    const timing = { step, durationMs: Date.now() - startMs, error };
    timings.push(timing);
    const status = error ? `FAILED: ${error}` : `${timing.durationMs}ms`;
    console.log(`  ${step.padEnd(22)} ${status}`);
    return timing;
  }

  async function cleanup() {
    await api.delete
      .service({ parameters: { projectId, serviceId } })
      .catch(() => {});
  }

  let t0 = Date.now();
  const svcRes = await api.create.service.deployment({
    parameters: { projectId },
    data: {
      name: serviceId,
      billing: { deploymentPlan: plan },
      deployment: {
        instances: 1,
        docker: {
          configType: "customCommand",
          customCommand: "sleep infinity",
        },
        internal: {
          id: "internal-build",
          buildSHA: "latest",
          branch: "main",
        },
      },
      runtimeEnvironment: {},
    },
  });

  if (svcRes.error) {
    recordStep("Create service", t0, JSON.stringify(svcRes.error));
    if (options.deleteServiceAtEnd) {
      await cleanup();
    }
    return { timings, success: false, execAttempts: 0 };
  }
  recordStep("Create service", t0);

  t0 = Date.now();
  const hardDeadline = Date.now() + HARD_TIMEOUT_MS;
  let execOk = false;
  let lastExecError = "";
  let attempts = 0;

  while (Date.now() < hardDeadline) {
    attempts++;
    const result = await tryExec(
      baseUrl,
      token,
      projectId,
      serviceId,
      ["bash", "-c", "echo i_am_online"],
      EXEC_ATTEMPT_TIMEOUT_MS,
    );

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
    if (options.deleteServiceAtEnd) {
      await cleanup();
    }
    return { timings, success: false, execAttempts: attempts };
  }

  recordStep("Exec readiness", t0);
  console.log(`    (${attempts} exec attempt(s))`);

  if (options.deleteServiceAtEnd) {
    t0 = Date.now();
    await api.delete
      .service({ parameters: { projectId, serviceId } })
      .catch(() => {});
    recordStep("Delete service", t0);
  }

  return { timings, success: true, execAttempts: attempts };
}

async function main() {
  const { plan, runs, help, deleteBetweenRuns } = parseArgs(
    process.argv.slice(2),
  );
  if (help) {
    printUsage();
    return;
  }

  const apiToken = process.env.NORTHFLANK_API_TOKEN;
  if (!apiToken) {
    throw new Error("NORTHFLANK_API_TOKEN env var is required");
  }

  const projectId = process.env.NORTHFLANK_PROJECT_ID ?? "dust-sandbox-dev";

  const contextProvider = new ApiClientInMemoryContextProvider();
  await contextProvider.addContext({ name: "default", token: apiToken });
  const api = new ApiClient(contextProvider);

  console.log(`Plan: ${plan}`);
  console.log(`Runs: ${runs}`);
  console.log(`Delete between runs: ${deleteBetweenRuns ? "yes" : "no"}`);
  console.log(
    `Readiness: retry exec until success (hard timeout: ${HARD_TIMEOUT_MS}ms)` +
      ` (attempt timeout: ${EXEC_ATTEMPT_TIMEOUT_MS}ms, retry: ${EXEC_RETRY_DELAY_MS}ms)`,
  );
  console.log(
    `Pattern: create(1 instance, no volume) -> exec${deleteBetweenRuns ? " -> delete" : ""}\n`,
  );

  await cleanupCluster(api, projectId);

  const results: BenchmarkRunResult[] = [];
  try {
    for (let i = 0; i < runs; i++) {
      const runLabel = runs === 1 ? "" : ` (${i + 1}/${runs})`;
      console.log(`--- Benchmark${runLabel}: ${plan} ---`);

      const result = await runBenchmark(api, projectId, plan, {
        deleteServiceAtEnd: deleteBetweenRuns,
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
      console.log("\nCleaning up bench services...");
      await cleanupCluster(api, projectId);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
