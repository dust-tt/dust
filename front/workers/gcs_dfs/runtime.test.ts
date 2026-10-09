import { createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransportConfigSchema } from "@app/workers/gcs_dfs/protocol";
import { startRuntime } from "@app/workers/gcs_dfs/runtime";

vi.mock("@app/lib/utils/statsd", () => ({
  getStatsDClient: () => ({ close: (done: () => void) => done() }),
  statsDMetrics: { increment: vi.fn(), distribution: vi.fn() },
}));

afterEach(() => vi.restoreAllMocks());

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("TCP port unavailable");
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

describe("GCS process HTTP probes", () => {
  it("tracks readiness separately from progress and withdraws readiness before drain", async () => {
    const healthPort = await freePort();
    const config = TransportConfigSchema.parse({
      subscription: "projects/test/subscriptions/probe",
      healthPort,
    });
    const runtime = await startRuntime(config, "relay", async () => {});
    const status = async (path: string) =>
      (await fetch(`http://127.0.0.1:${healthPort}${path}`)).status;
    try {
      expect(await status("/livez")).toBe(200);
      expect(await status("/readyz")).toBe(503);
      runtime.observe({ operation: "pull", outcome: "success" });
      expect(await status("/readyz")).toBe(200);
      runtime.observe({ operation: "relay_publish", outcome: "error" });
      expect(await status("/readyz")).toBe(503);
      expect(await status("/livez")).toBe(200);
      runtime.observe({ operation: "relay_publish", outcome: "success" });
      expect(await status("/readyz")).toBe(200);
      const nowMs = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(
        nowMs + config.livenessTimeoutMs + 1
      );
      runtime.observe({ operation: "lease", outcome: "success" });
      expect(await status("/livez")).toBe(503);
      runtime.observe({ operation: "pull", outcome: "error" });
      expect(await status("/livez")).toBe(200);
      runtime.stop();
      expect(runtime.stopping()).toBe(true);
      expect(await status("/readyz")).toBe(503);
      expect(await status("/unknown")).toBe(404);
    } finally {
      await runtime.close();
    }
  });

  it("keeps failed backend checks unready without failing liveness", async () => {
    const healthPort = await freePort();
    const config = TransportConfigSchema.parse({
      subscription: "projects/test/subscriptions/probe",
      healthPort,
    });
    const runtime = await startRuntime(config, "importer", async () => {
      throw new Error("DFS unavailable");
    });
    try {
      runtime.observe({ operation: "pull", outcome: "success" });
      expect(
        (await fetch(`http://127.0.0.1:${healthPort}/readyz`)).status
      ).toBe(503);
      expect((await fetch(`http://127.0.0.1:${healthPort}/livez`)).status).toBe(
        200
      );
    } finally {
      await runtime.close();
    }
  });
});
