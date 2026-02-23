/**
 * Benchmark Blaxel Sandbox cold start latency.
 *
 * Pattern (same as Northflank/Cloudflare benchmark):
 *   create sandbox -> retry exec until online -> delete sandbox
 *
 * Run from repo root (requires front deps for tsx):
 *   cd front && BLAXEL_API_KEY=xxx BLAXEL_WORKSPACE=your-workspace \
 *     npx tsx ../x/henry/sandbox-benchmarks/blaxel/bench_sandbox.ts [plan] [-n <runs>] [--no-delete-between-runs]
 *
 * Also accepted:
 *   BL_API_KEY, BL_WORKSPACE, BLAXEL_API_BASE_URL, BLAXEL_RUN_BASE_URL,
 *   BLAXEL_SANDBOX_IMAGE, BLAXEL_SANDBOX_MEMORY_MB, BLAXEL_SANDBOX_REGION
 */

const HARD_TIMEOUT_MS = 60_000; // fail if not online
const EXEC_RETRY_DELAY_MS = 500;
const EXEC_ATTEMPT_TIMEOUT_MS = 5_000;

const DEFAULT_API_BASE_URL = "https://api.blaxel.ai/v0";
const DEFAULT_RUN_BASE_URL = "https://run.blaxel.ai";
const DEFAULT_SANDBOX_IMAGE = "blaxel/base-image:latest";
const DEFAULT_SANDBOX_MEMORY_MB = 4096;

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

interface BlaxelMetadata {
  name: string;
  url?: string;
  labels?: Record<string, string>;
}

interface BlaxelSandbox {
  metadata: BlaxelMetadata;
  status?: string;
}

interface BlaxelProcessResponse {
  status?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

interface BlaxelWorkspace {
  name: string;
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
  plan                      Blaxel bench plan label (default: base)

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

  return { plan: plan ?? "base", runs, help, deleteBetweenRuns };
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

function getRequiredEnv(primary: string, fallback?: string): string {
  const value = getEnv(primary) ?? (fallback ? getEnv(fallback) : undefined);
  if (!value) {
    throw new Error(
      `${primary} env var is required${fallback ? ` (or ${fallback})` : ""}`,
    );
  }
  return value;
}

function normalizeUrl(baseUrl: string): string {
  if (baseUrl.endsWith("/")) {
    return baseUrl.slice(0, -1);
  }
  return baseUrl;
}

function asUrlBase(baseUrl: string): string {
  return `${normalizeUrl(baseUrl)}/`;
}

function sanitizePlan(plan: string): string {
  const normalized = plan
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!normalized) {
    return "base";
  }
  return normalized.slice(0, 20);
}

function buildHeaders(
  apiKey: string,
  workspace: string | undefined,
  includeJsonContentType: boolean,
): HeadersInit {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "x-blaxel-authorization": `Bearer ${apiKey}`,
  };
  if (workspace) {
    headers["x-blaxel-workspace"] = workspace;
  }
  if (includeJsonContentType) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) {
    return `HTTP ${res.status} ${res.statusText}`;
  }

  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    if (body.message) {
      return `HTTP ${res.status} ${res.statusText} — ${body.message}`;
    }
    if (body.error) {
      return `HTTP ${res.status} ${res.statusText} — ${body.error}`;
    }
  } catch {
    // fall through
  }

  return `HTTP ${res.status} ${res.statusText} — ${text}`;
}

async function requestJson<T>(
  input: URL | string,
  options: {
    method: "GET" | "POST" | "DELETE";
    headers: HeadersInit;
    body?: unknown;
    signal?: AbortSignal;
  },
): Promise<T> {
  const res = await fetch(input, {
    method: options.method,
    headers: options.headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }

  if (res.status === 204) {
    return {} as T;
  }

  return (await res.json()) as T;
}

function getSandboxRunUrl(
  sandbox: BlaxelSandbox,
  runBaseUrl: string,
  workspace: string,
): string {
  if (sandbox.metadata.url) {
    return normalizeUrl(sandbox.metadata.url);
  }
  return `${normalizeUrl(runBaseUrl)}/${workspace}/sandboxes/${sandbox.metadata.name}`;
}

async function tryExec(
  sandboxRunUrl: string,
  apiKey: string,
  workspace: string,
  timeoutMs: number,
): Promise<ExecResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const processResponse = await requestJson<BlaxelProcessResponse>(
      new URL("process", asUrlBase(sandboxRunUrl)),
      {
        method: "POST",
        headers: buildHeaders(apiKey, workspace, true),
        body: {
          command: "echo i_am_online",
          waitForCompletion: true,
          timeout: timeoutMs,
        },
        signal: controller.signal,
      },
    );

    const stdout = processResponse.stdout ?? "";
    const stderr = processResponse.stderr ?? "";
    const status = processResponse.status ?? "unknown";
    const exitCode =
      typeof processResponse.exitCode === "number" ? processResponse.exitCode : -1;

    if (
      (status === "completed" || status === "running") &&
      stdout.includes("i_am_online")
    ) {
      return { ok: true, stdout, stderr };
    }

    return {
      ok: false,
      stdout,
      stderr,
      error: `status=${status} exit=${exitCode}`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, stdout: "", stderr: "", error: "exec timeout" };
    }
    return {
      ok: false,
      stdout: "",
      stderr: "",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function listSandboxes(
  apiBaseUrl: string,
  apiKey: string,
  workspace: string,
): Promise<BlaxelSandbox[]> {
  return await requestJson<BlaxelSandbox[]>(
    new URL("sandboxes", asUrlBase(apiBaseUrl)),
    {
      method: "GET",
      headers: buildHeaders(apiKey, workspace, false),
    },
  );
}

async function resolveWorkspace(
  apiBaseUrl: string,
  apiKey: string,
): Promise<{ workspace: string; source: "env" | "auto" }> {
  const fromEnv = getEnv("BLAXEL_WORKSPACE") ?? getEnv("BL_WORKSPACE");
  if (fromEnv) {
    return { workspace: fromEnv, source: "env" };
  }

  const workspaces = await requestJson<BlaxelWorkspace[]>(
    new URL("workspaces", asUrlBase(apiBaseUrl)),
    {
      method: "GET",
      headers: buildHeaders(apiKey, undefined, false),
    },
  );

  if (workspaces.length === 0) {
    throw new Error(
      "No accessible workspaces found for this API key. Set BLAXEL_WORKSPACE manually.",
    );
  }

  if (workspaces.length === 1 && workspaces[0].name) {
    return { workspace: workspaces[0].name, source: "auto" };
  }

  const names = workspaces
    .map((w) => w.name)
    .filter((name): name is string => Boolean(name));
  throw new Error(
    `Multiple workspaces found (${names.join(", ")}). Set BLAXEL_WORKSPACE (or BL_WORKSPACE).`,
  );
}

async function deleteSandbox(
  apiBaseUrl: string,
  apiKey: string,
  workspace: string,
  sandboxName: string,
): Promise<void> {
  await requestJson<unknown>(
    new URL(
      `sandboxes/${encodeURIComponent(sandboxName)}`,
      asUrlBase(apiBaseUrl),
    ),
    {
      method: "DELETE",
      headers: buildHeaders(apiKey, workspace, false),
    },
  );
}

async function cleanupCluster(
  apiBaseUrl: string,
  apiKey: string,
  workspace: string,
) {
  console.log("Cleaning up existing resources...");

  const sandboxes = await listSandboxes(apiBaseUrl, apiKey, workspace);
  for (const sandbox of sandboxes) {
    if (sandbox.metadata.name.startsWith("bench-")) {
      console.log(`  Deleting sandbox: ${sandbox.metadata.name}`);
      await deleteSandbox(
        apiBaseUrl,
        apiKey,
        workspace,
        sandbox.metadata.name,
      ).catch(() => {});
    }
  }

  console.log("Cleanup done.\n");
}

async function createSandbox(
  apiBaseUrl: string,
  apiKey: string,
  workspace: string,
  params: {
    sandboxName: string;
    plan: string;
    image: string;
    memoryMb: number;
    region?: string;
  },
): Promise<BlaxelSandbox> {
  const body: {
    metadata: BlaxelMetadata;
    spec: {
      runtime: { image: string; memory: number };
      region?: string;
    };
  } = {
    metadata: {
      name: params.sandboxName,
      labels: {
        benchmark: "sandbox-cold-start",
        provider: "blaxel",
        plan: params.plan,
      },
    },
    spec: {
      runtime: {
        image: params.image,
        memory: params.memoryMb,
      },
    },
  };

  if (params.region) {
    body.spec.region = params.region;
  }

  return await requestJson<BlaxelSandbox>(
    new URL("sandboxes", asUrlBase(apiBaseUrl)),
    {
      method: "POST",
      headers: buildHeaders(apiKey, workspace, true),
      body,
    },
  );
}

async function runBenchmark(
  apiBaseUrl: string,
  runBaseUrl: string,
  apiKey: string,
  workspace: string,
  plan: string,
  options: {
    deleteSandboxAtEnd: boolean;
    image: string;
    memoryMb: number;
    region?: string;
  },
): Promise<BenchmarkRunResult> {
  const planShort = sanitizePlan(plan);
  const ts = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const sandboxName = `bench-${planShort}-${ts}`;
  const timings: StepTiming[] = [];
  let sandboxRunUrl = `${normalizeUrl(runBaseUrl)}/${workspace}/sandboxes/${sandboxName}`;

  function recordStep(step: string, startMs: number, error?: string): StepTiming {
    const timing = { step, durationMs: Date.now() - startMs, error };
    timings.push(timing);
    const status = error ? `FAILED: ${error}` : `${timing.durationMs}ms`;
    console.log(`  ${step.padEnd(22)} ${status}`);
    return timing;
  }

  async function cleanup() {
    await deleteSandbox(apiBaseUrl, apiKey, workspace, sandboxName).catch(() => {});
  }

  let t0 = Date.now();
  try {
    const sandbox = await createSandbox(apiBaseUrl, apiKey, workspace, {
      sandboxName,
      plan,
      image: options.image,
      memoryMb: options.memoryMb,
      region: options.region,
    });
    sandboxRunUrl = getSandboxRunUrl(sandbox, runBaseUrl, workspace);
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
    const result = await tryExec(
      sandboxRunUrl,
      apiKey,
      workspace,
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
    if (options.deleteSandboxAtEnd) {
      await cleanup();
    }
    return { timings, success: false, execAttempts: attempts };
  }

  recordStep("Exec readiness", t0);
  console.log(`    (${attempts} exec attempt(s))`);

  if (options.deleteSandboxAtEnd) {
    t0 = Date.now();
    await deleteSandbox(apiBaseUrl, apiKey, workspace, sandboxName).catch(() => {});
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

  const apiKey = getRequiredEnv("BLAXEL_API_KEY", "BL_API_KEY");

  const apiBaseUrl = normalizeUrl(
    getEnv("BLAXEL_API_BASE_URL") ?? DEFAULT_API_BASE_URL,
  );
  const { workspace, source: workspaceSource } = await resolveWorkspace(
    apiBaseUrl,
    apiKey,
  );
  const runBaseUrl = normalizeUrl(
    getEnv("BLAXEL_RUN_BASE_URL") ?? DEFAULT_RUN_BASE_URL,
  );
  const image = getEnv("BLAXEL_SANDBOX_IMAGE") ?? DEFAULT_SANDBOX_IMAGE;
  const memoryMb = getEnv("BLAXEL_SANDBOX_MEMORY_MB")
    ? parsePositiveInt("BLAXEL_SANDBOX_MEMORY_MB", getEnv("BLAXEL_SANDBOX_MEMORY_MB")!)
    : DEFAULT_SANDBOX_MEMORY_MB;
  const region = getEnv("BLAXEL_SANDBOX_REGION");

  console.log(`Plan: ${plan}`);
  console.log(`Runs: ${runs}`);
  console.log(`Delete between runs: ${deleteBetweenRuns ? "yes" : "no"}`);
  console.log(
    `Workspace: ${workspace}${workspaceSource === "auto" ? " (auto-detected)" : ""}`,
  );
  console.log(`API base URL: ${apiBaseUrl}`);
  console.log(`Run base URL: ${runBaseUrl}`);
  console.log(`Sandbox image: ${image}`);
  console.log(`Sandbox memory: ${memoryMb}MB`);
  if (region) {
    console.log(`Sandbox region: ${region}`);
  }
  console.log(
    `Readiness: retry exec until success (hard timeout: ${HARD_TIMEOUT_MS}ms)` +
      ` (attempt timeout: ${EXEC_ATTEMPT_TIMEOUT_MS}ms, retry: ${EXEC_RETRY_DELAY_MS}ms)`,
  );
  console.log(
    `Pattern: create(1 sandbox, no volume) -> exec${deleteBetweenRuns ? " -> delete" : ""}\n`,
  );

  await cleanupCluster(apiBaseUrl, apiKey, workspace);

  const results: BenchmarkRunResult[] = [];
  try {
    for (let i = 0; i < runs; i++) {
      const runLabel = runs === 1 ? "" : ` (${i + 1}/${runs})`;
      console.log(`--- Benchmark${runLabel}: ${plan} ---`);

      const result = await runBenchmark(
        apiBaseUrl,
        runBaseUrl,
        apiKey,
        workspace,
        plan,
        {
          deleteSandboxAtEnd: deleteBetweenRuns,
          image,
          memoryMb,
          region,
        },
      );
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
      await cleanupCluster(apiBaseUrl, apiKey, workspace);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
