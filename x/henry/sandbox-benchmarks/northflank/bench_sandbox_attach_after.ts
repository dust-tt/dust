/**
 * Benchmark sandbox exec with the "attach-after-ready" pattern:
 *   1) create service (instances=1)
 *   2) wait for deployment COMPLETED
 *   3) create+attach volume (may trigger a service restart)
 *   4) immediately exec via ExecCommandStandard (WebSocket)
 *
 * Run from repo root (requires front deps):
 *   cd front && NORTHFLANK_API_TOKEN=xxx npx tsx ../x/henry/sandbox-benchmarks/northflank/bench_sandbox_attach_after.ts nf-compute-20
 */

import {
  ApiClient,
  ApiClientInMemoryContextProvider,
  ExecCommandStandard,
} from "@northflank/js-client";
import https from "https";

const POLL_INTERVAL_MS = 2000;
const READY_TIMEOUT_MS = 120_000;
const EXEC_TIMEOUT_MS = 60_000;
const EXEC_MAX_ATTEMPTS = 10;
const EXEC_RETRY_DELAY_MS = 1000;

const VOLUME_SIZE_MB = 5120;
const VOLUME_MOUNT_PATH = "/workspace";
const BASE_IMAGE = "buildpack-deps:22.04-curl";
const SPOT_TAG = "spot-workload";

const httpsAgent = new https.Agent({ keepAlive: true });

interface StepResult {
  step: string;
  durationMs: number;
  error?: string;
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

async function execWithRetries(
  api: ApiClient,
  params: { projectId: string; serviceId: string },
  command: string[],
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  const baseUrl = api.contextProvider.getCurrentBaseUrl(true);
  const token = api.contextProvider.getCurrentToken();
  if (!baseUrl || !token) {
    return { ok: false, error: "Northflank base URL/token not configured" };
  }

  let lastError = "";
  for (let attempt = 1; attempt <= EXEC_MAX_ATTEMPTS; attempt++) {
    const result = await tryExec(
      baseUrl,
      token,
      params.projectId,
      params.serviceId,
      command,
      EXEC_TIMEOUT_MS,
    );

    if (result.ok) {
      return { ok: true, stdout: result.stdout };
    }

    lastError = result.error ?? "unknown";
    if (attempt < EXEC_MAX_ATTEMPTS) {
      await sleep(EXEC_RETRY_DELAY_MS);
    }
  }

  return {
    ok: false,
    error: `Exec failed after ${EXEC_MAX_ATTEMPTS} attempts (last: ${lastError})`,
  };
}

async function waitForCompleted(
  api: ApiClient,
  params: { projectId: string; serviceId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastStatus = "UNKNOWN";
  while (Date.now() < deadline) {
    const sr = await api.get.service({ parameters: params });
    if (sr.error) {
      return { ok: false, error: `Poll error: ${JSON.stringify(sr.error)}` };
    }
    lastStatus = sr.data?.status?.deployment?.status ?? "UNKNOWN";
    if (lastStatus === "COMPLETED" && !sr.data.servicePaused) {
      return { ok: true };
    }
    if (lastStatus === "FAILED") {
      return {
        ok: false,
        error: `Deployment FAILED: ${JSON.stringify(sr.data.status)}`,
      };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return {
    ok: false,
    error: `Timed out (${READY_TIMEOUT_MS}ms), last status: ${lastStatus}`,
  };
}

async function runBenchmark(
  api: ApiClient,
  projectId: string,
  plan: string,
): Promise<{ steps: StepResult[]; fatalError?: string }> {
  const planShort = plan.replace("nf-compute-", "c");
  const ts = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const serviceId = `bench2-${planShort}-${ts}`;
  const volumeId = `bvol2-${planShort}-${ts}`;
  const steps: StepResult[] = [];

  async function cleanup() {
    await api.delete
      .service({ parameters: { projectId, serviceId } })
      .catch(() => {});

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const r = await api.delete
        .volume({ parameters: { projectId, volumeId } })
        .catch(() => ({ error: { status: 500 } }));
      if (!r.error) {
        break;
      }
      if (r.error.status === 409) {
        await sleep(1000);
        continue;
      }
      break;
    }
  }

  let t0 = Date.now();
  const svcRes = await api.create.service.deployment({
    parameters: { projectId },
    data: {
      name: serviceId,
      tags: [SPOT_TAG],
      billing: { deploymentPlan: plan },
      deployment: {
        instances: 1,
        external: { imagePath: BASE_IMAGE },
        docker: { configType: "customCommand", customCommand: "sleep infinity" },
      },
      runtimeEnvironment: {},
    },
  });
  if (svcRes.error) {
    steps.push({
      step: "Create service",
      durationMs: Date.now() - t0,
      error: JSON.stringify(svcRes.error),
    });
    return { steps, fatalError: "Create service failed" };
  }
  steps.push({ step: "Create service", durationMs: Date.now() - t0 });

  t0 = Date.now();
  const waitRes = await waitForCompleted(api, { projectId, serviceId });
  if (!waitRes.ok) {
    steps.push({
      step: "Wait for ready",
      durationMs: Date.now() - t0,
      error: waitRes.error,
    });
    await cleanup();
    return { steps, fatalError: "Wait for ready timed out" };
  }
  steps.push({ step: "Wait for ready", durationMs: Date.now() - t0 });

  t0 = Date.now();
  const volRes = await api.create.volume({
    parameters: { projectId },
    data: {
      name: volumeId,
      tags: [SPOT_TAG],
      mounts: [{ containerMountPath: VOLUME_MOUNT_PATH }],
      spec: {
        accessMode: "ReadWriteMany",
        storageClassName: "ceph-filesystem",
        storageSize: VOLUME_SIZE_MB,
      },
      attachedObjects: [{ id: serviceId, type: "service" }],
    },
  });
  if (volRes.error) {
    steps.push({
      step: "Create volume",
      durationMs: Date.now() - t0,
      error: JSON.stringify(volRes.error),
    });
    await cleanup();
    return { steps, fatalError: "Create volume failed" };
  }
  steps.push({ step: "Create volume", durationMs: Date.now() - t0 });

  t0 = Date.now();
  const execRes = await execWithRetries(
    api,
    { projectId, serviceId },
    ["bash", "-c", "echo hello-from-sandbox"],
  );
  if (!execRes.ok) {
    steps.push({ step: "Exec command", durationMs: Date.now() - t0, error: execRes.error });
    await cleanup();
    return { steps, fatalError: "Exec failed" };
  }
  const lastLine = execRes.stdout.trim().split("\n").pop();
  console.log(`    exec output: ${lastLine}`);
  steps.push({ step: "Exec command", durationMs: Date.now() - t0 });

  t0 = Date.now();
  await api.delete.service({ parameters: { projectId, serviceId } });
  steps.push({ step: "Delete service", durationMs: Date.now() - t0 });

  // Best-effort volume delete
  t0 = Date.now();
  await api.delete.volume({ parameters: { projectId, volumeId } }).catch(() => {});
  steps.push({ step: "Delete volume", durationMs: Date.now() - t0 });

  return { steps };
}

async function main() {
  const apiToken = process.env.NORTHFLANK_API_TOKEN;
  if (!apiToken) {
    throw new Error("NORTHFLANK_API_TOKEN env var is required");
  }

  const projectId = process.env.NORTHFLANK_PROJECT_ID ?? "dust-sandbox-dev";
  const plans = process.argv.slice(2);
  if (plans.length === 0 || plans.includes("-h") || plans.includes("--help")) {
    console.log(
      "Usage: bench_sandbox_attach_after.ts <plan1> [plan2 ...]\n" +
        "Example: nf-compute-20 nf-compute-100-2 nf-compute-200",
    );
    return;
  }

  const contextProvider = new ApiClientInMemoryContextProvider();
  await contextProvider.addContext({ name: "default", token: apiToken });
  const api = new ApiClient(contextProvider);

  console.log(`Image: ${BASE_IMAGE}`);
  console.log(`Exec: ${EXEC_MAX_ATTEMPTS} attempts, timeout ${EXEC_TIMEOUT_MS}ms\n`);

  for (const plan of plans) {
    console.log(`--- Benchmark: ${plan} ---`);
    const { steps, fatalError } = await runBenchmark(api, projectId, plan);
    for (const s of steps) {
      const status = s.error ? `FAILED: ${s.error}` : `${s.durationMs}ms`;
      console.log(`  ${s.step.padEnd(18)} ${status}`);
    }
    if (fatalError) {
      console.log(`RESULT: FAILED (${fatalError})`);
    }
    console.log();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
