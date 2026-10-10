/**
 * Benchmark Run Cloud Sandbox cold start latency.
 *
 * Pattern (same as Daytona/E2B/Blaxel benchmark):
 *   create sandbox -> retry exec until online -> delete sandbox
 *
 * Run from repo root (requires front deps for tsx):
 *   npm --prefix x/henry/sandbox-benchmarks/run-cloud install
 *   cd front && RUN_CLOUD_API_KEY=xxx \
 *     npx tsx ../x/henry/sandbox-benchmarks/run-cloud/bench_sandbox.ts [image] [-n <runs>] [--no-delete-between-runs]
 */

import { Client, type Sandbox } from "@run-cloud/sdk";

const HARD_TIMEOUT_MS = 60_000; // fail if not online
const EXEC_RETRY_DELAY_MS = 500;
const EXEC_ATTEMPT_TIMEOUT_MS = 5_000;

const SANDBOX_TIMEOUT_SECONDS = 300;
const BENCHMARK_NAME_PREFIX = "dust-sandbox-cold-start-";

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

interface ExecResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printUsage(): void {
  console.log(`Usage:
  bench_sandbox.ts [image] [-n <runs>] [--no-delete-between-runs]

Args:
  image                     Run Cloud image (default: runcloud/agent-base)

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
  image: string;
  runs: number;
  help: boolean;
  deleteBetweenRuns: boolean;
} {
  let image: string | undefined;
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

    if (!image) {
      image = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return {
    image: image ?? "runcloud/agent-base",
    runs,
    help,
    deleteBetweenRuns,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
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

function sanitizeImage(image: string): string {
  const normalized = image
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!normalized) {
    return "default";
  }
  return normalized.slice(0, 20);
}

async function cleanupCluster(runCloud: Client): Promise<void> {
  console.log("Cleaning up existing resources...");

  const sandboxes = await runCloud.sandboxes.list();
  const benchmarkSandboxes = sandboxes.filter(
    (sandbox) =>
      sandbox.name?.startsWith(BENCHMARK_NAME_PREFIX) &&
      sandbox.state !== "destroyed" &&
      sandbox.state !== "destroying",
  );

  for (const sandbox of benchmarkSandboxes) {
    console.log(`  Deleting sandbox: ${sandbox.id}`);
    await runCloud.sandboxes.destroy(sandbox.id).catch(() => {});
  }

  console.log("Cleanup done.\n");
}

async function tryExec(
  apiUrl: string,
  apiKey: string,
  sandbox: Sandbox,
  timeoutMs: number,
): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${apiUrl}/run-cloud/sandboxes/${encodeURIComponent(sandbox.id)}/exec`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cmd: ["/bin/sh", "-c", "echo i_am_online"],
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        stdout: "",
        stderr: "",
        error: `Run Cloud API ${response.status}: ${await response.text()}`,
      };
    }

    const body: unknown = await response.json();
    const result = parseExecResponse(body);
    const stdout = result.stdout.trim();
    const stderr = result.stderr.trim();

    if (result.exitCode === 0 && stdout.includes("i_am_online")) {
      return { ok: true, stdout, stderr };
    }

    return {
      ok: false,
      stdout,
      stderr,
      error:
        `exit=${result.exitCode}` +
        `${stdout ? ` stdout=${JSON.stringify(stdout)}` : ""}` +
        `${stderr ? ` stderr=${JSON.stringify(stderr)}` : ""}`,
    };
  } catch (err) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseExecResponse(value: unknown): ExecResponse {
  if (typeof value !== "object" || value === null) {
    throw new Error("Run Cloud exec returned a non-object response");
  }

  const exitCode: unknown = Reflect.get(value, "exit_code");
  const stdout: unknown = Reflect.get(value, "stdout");
  const stderr: unknown = Reflect.get(value, "stderr");

  if (
    !Number.isSafeInteger(exitCode) ||
    typeof stdout !== "string" ||
    typeof stderr !== "string"
  ) {
    throw new Error("Run Cloud exec returned an invalid response");
  }

  return {
    exitCode: Number(exitCode),
    stdout,
    stderr,
  };
}

async function runBenchmark(
  runCloud: Client,
  apiUrl: string,
  apiKey: string,
  image: string,
  options: { deleteSandboxAtEnd: boolean },
): Promise<BenchmarkRunResult> {
  const imageShort = sanitizeImage(image);
  const timestamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const sandboxName = `${BENCHMARK_NAME_PREFIX}${imageShort}-${timestamp}`;
  const timings: StepTiming[] = [];
  let sandbox: Sandbox | null = null;

  function recordStep(
    step: string,
    startMs: number,
    error?: string,
  ): StepTiming {
    const timing = { step, durationMs: Date.now() - startMs, error };
    timings.push(timing);
    const status = error ? `FAILED: ${error}` : `${timing.durationMs}ms`;
    console.log(`  ${step.padEnd(22)} ${status}`);
    return timing;
  }

  async function cleanup(): Promise<void> {
    if (!sandbox) {
      return;
    }
    await runCloud.sandboxes.destroy(sandbox.id).catch(() => {});
  }

  let startMs = Date.now();
  try {
    sandbox = await runCloud.sandboxes.create({
      name: sandboxName,
      image,
      timeoutSeconds: SANDBOX_TIMEOUT_SECONDS,
      idempotencyKey: sandboxName,
    });
    recordStep("Create service", startMs);
  } catch (err) {
    recordStep(
      "Create service",
      startMs,
      err instanceof Error ? err.message : String(err),
    );
    if (options.deleteSandboxAtEnd) {
      await cleanup();
    }
    return { timings, success: false, execAttempts: 0 };
  }

  startMs = Date.now();
  const hardDeadlineMs = Date.now() + HARD_TIMEOUT_MS;
  let execOk = false;
  let lastExecError = "";
  let attempts = 0;

  while (Date.now() < hardDeadlineMs) {
    attempts++;
    const result = await tryExec(
      apiUrl,
      apiKey,
      sandbox,
      EXEC_ATTEMPT_TIMEOUT_MS,
    );

    if (result.ok && result.stdout.includes("i_am_online")) {
      execOk = true;
      break;
    }

    lastExecError = result.error ?? "no output";

    if (Date.now() < hardDeadlineMs) {
      await sleep(EXEC_RETRY_DELAY_MS);
    }
  }

  if (!execOk) {
    recordStep(
      "Exec readiness",
      startMs,
      `${attempts} attempts in ${HARD_TIMEOUT_MS}ms — last: ${lastExecError}`,
    );
    if (options.deleteSandboxAtEnd) {
      await cleanup();
    }
    return { timings, success: false, execAttempts: attempts };
  }

  recordStep("Exec readiness", startMs);
  console.log(`    (${attempts} exec attempt(s))`);

  if (options.deleteSandboxAtEnd) {
    startMs = Date.now();
    await cleanup();
    recordStep("Delete service", startMs);
  }

  return { timings, success: true, execAttempts: attempts };
}

async function main(): Promise<void> {
  const { image, runs, help, deleteBetweenRuns } = parseArgs(
    process.argv.slice(2),
  );
  if (help) {
    printUsage();
    return;
  }

  const apiKey = getRequiredEnv("RUN_CLOUD_API_KEY");
  const apiUrl = getEnv("RUN_CLOUD_API_URL") ?? "https://api.run.cloud";
  const runCloud = new Client({ apiKey, apiUrl });

  console.log(`Image: ${image}`);
  console.log(`Runs: ${runs}`);
  console.log(`Delete between runs: ${deleteBetweenRuns ? "yes" : "no"}`);
  console.log(`API URL: ${apiUrl}`);
  console.log(
    `Readiness: retry exec until success (hard timeout: ${HARD_TIMEOUT_MS}ms)` +
      ` (attempt timeout: ${EXEC_ATTEMPT_TIMEOUT_MS}ms, retry: ${EXEC_RETRY_DELAY_MS}ms)`,
  );
  console.log(
    `Pattern: create(1 sandbox, no volume) -> exec${deleteBetweenRuns ? " -> delete" : ""}\n`,
  );

  await cleanupCluster(runCloud);

  const results: BenchmarkRunResult[] = [];
  try {
    for (let i = 0; i < runs; i++) {
      const runLabel = runs === 1 ? "" : ` (${i + 1}/${runs})`;
      console.log(`--- Benchmark${runLabel}: ${image} ---`);

      const result = await runBenchmark(runCloud, apiUrl, apiKey, image, {
        deleteSandboxAtEnd: deleteBetweenRuns,
      });
      results.push(result);

      console.log();
      if (result.success) {
        const totalMs = result.timings.reduce(
          (sum, timing) => sum + timing.durationMs,
          0,
        );
        console.log(`TOTAL: ${totalMs}ms`);
      } else {
        console.log("RESULT: FAILED");
        const failedStep = result.timings.find((timing) => timing.error);
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

    const successfulResults = results.filter((result) => result.success);
    const failedRuns = results.length - successfulResults.length;

    console.log("=== Summary ===");
    console.log(
      `Runs: ${results.length} (success: ${successfulResults.length}, failed: ${failedRuns})`,
    );

    if (successfulResults.length === 0) {
      return;
    }

    const totalMsByRun = successfulResults.map((result) =>
      result.timings.reduce((sum, timing) => sum + timing.durationMs, 0),
    );
    const execAttemptsByRun = successfulResults.map(
      (result) => result.execAttempts,
    );

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
      new Set(
        successfulResults.flatMap((result) =>
          result.timings.map((timing) => timing.step),
        ),
      ),
    );

    for (const stepName of stepNames) {
      const stepDurationsMs = successfulResults
        .map((result) =>
          result.timings.find((timing) => timing.step === stepName),
        )
        .filter(
          (timing): timing is StepTiming =>
            timing !== undefined && !timing.error,
        )
        .map((timing) => timing.durationMs);

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
      await cleanupCluster(runCloud);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
