import { ALL_WORKERS } from "@connectors/temporal/worker_registry";
import { type ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

const WORKER_TIMEOUT_MS = 25000;
const STARTUP_VERIFICATION_MS = 10000;

interface WorkerTestResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

describe("Temporal Workers Smoke Tests", () => {
  const activeProcesses = new Set<ChildProcess>();

  beforeAll(() => {
    const bundleDir = path.join(__dirname, "../../dist/temporal-bundles");
    if (!fs.existsSync(bundleDir)) {
      throw new Error(
        "Temporal bundles not found. Run: npm run build:temporal-bundles"
      );
    }
  });

  afterEach(() => {
    for (const proc of activeProcesses) {
      if (proc.exitCode === null) {
        proc.kill("SIGTERM");
        const killTimeoutMs = 2000;
        setTimeout(() => {
          if (proc.exitCode === null) {
            proc.kill("SIGKILL");
          }
        }, killTimeoutMs);
      }
    }
    activeProcesses.clear();
  });

  test.concurrent.each(ALL_WORKERS)(
    "Worker: %s starts with production bundle",
    async (workerName) => {
      const result = await testWorkerStartup(workerName);

      expect(
        result.success,
        `Worker failed:\n${result.error}\n\nStderr:\n${result.stderr}\n\nStdout:\n${result.stdout}`
      ).toBe(true);
    },
    WORKER_TIMEOUT_MS
  );

  async function testWorkerStartup(
    workerName: string
  ): Promise<WorkerTestResult> {
    return new Promise((resolve) => {
      const proc = spawn(
        "node",
        ["dist/start_worker.js", "--workers", workerName],
        {
          env: {
            ...process.env,
            NODE_ENV: "production",
            USE_TEMPORAL_BUNDLES: "true",
            LOG_LEVEL: "error",
            TEMPORAL_ADDRESS: "localhost:7233",
          },
          cwd: path.join(__dirname, "../.."),
        }
      );

      activeProcesses.add(proc);

      let stdout = "";
      let stderr = "";
      let resolved = false;

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();

        if (detectBundleError(stderr) && !resolved) {
          resolved = true;
          proc.kill("SIGTERM");
          resolve({
            success: false,
            stdout,
            stderr,
            error: "Bundle/import error detected in logs",
          });
        }
      });

      proc.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          resolve({
            success: false,
            stdout,
            stderr,
            error: `Process error: ${err.message}`,
          });
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill("SIGTERM");
          resolve({
            success: true,
            stdout,
            stderr,
          });
        }
      }, STARTUP_VERIFICATION_MS);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill("SIGKILL");
          resolve({
            success: false,
            stdout,
            stderr,
            error: "Timeout: worker did not complete verification",
          });
        }
      }, WORKER_TIMEOUT_MS);
    });
  }

  function detectBundleError(output: string): boolean {
    const errorPatterns = [
      /Cannot find module/i,
      /MODULE_NOT_FOUND/,
      /Failed to read workflow bundle/i,
      /@dust-tt\/\w+\/src\//,
      /SyntaxError.*Unexpected token/,
      /Error.*Cannot resolve/i,
    ];

    return errorPatterns.some((pattern) => pattern.test(output));
  }
});
