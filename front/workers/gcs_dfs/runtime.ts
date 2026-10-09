import { createServer } from "node:http";

import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { TransportConfig } from "@app/workers/gcs_dfs/protocol";
import { metricsObserver } from "@app/workers/gcs_dfs/telemetry";
import type { Observer } from "@app/workers/gcs_dfs/telemetry";

export async function startRuntime(
  config: TransportConfig,
  component: "relay" | "importer",
  checkBackends: () => Promise<void>
) {
  let stopping = false;
  let pulled = false;
  let backendReady = false;
  let lastProgressMs = Date.now();
  let drainTimer: NodeJS.Timeout | undefined;
  const failures = new Set<string>();
  const metrics = metricsObserver(config, component);
  const observe: Observer = (event) => {
    if (event.operation !== "lease") {
      lastProgressMs = Date.now();
    }
    if (event.operation === "pull" && event.outcome === "success") {
      pulled = true;
    }
    if (event.operation !== "message" && event.operation !== "cas_retry") {
      if (
        event.outcome === "error" &&
        event.errorClass !== "source_cursor_changed"
      ) {
        failures.add(event.operation);
      } else {
        failures.delete(event.operation);
      }
    }
    metrics(event);
  };
  const stop = () => {
    if (!stopping) {
      stopping = true;
      logger.info({ component }, "GCS DFS process draining");
      drainTimer = setTimeout(() => process.exit(1), config.drainTimeoutMs);
      drainTimer.unref();
    }
  };
  const server = createServer((request, response) => {
    if (
      request.method !== "GET" ||
      !["/livez", "/readyz"].includes(request.url ?? "")
    ) {
      response.writeHead(404).end();
      return;
    }
    const live = Date.now() - lastProgressMs < config.livenessTimeoutMs;
    const ready =
      live && !stopping && pulled && backendReady && failures.size === 0;
    response.writeHead((request.url === "/livez" ? live : ready) ? 200 : 503, {
      "Content-Type": "application/json",
    });
    response.end(
      JSON.stringify(request.url === "/livez" ? { live } : { ready })
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.healthPort, "0.0.0.0", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  let checking: Promise<void> | null = null;
  const check = () => {
    if (!checking && !stopping) {
      checking = checkBackends()
        .then(() => {
          backendReady = true;
        })
        .catch(() => {
          backendReady = false;
        })
        .finally(() => {
          checking = null;
        });
    }
  };
  check();
  const timer = setInterval(check, 30_000);
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return {
    observe,
    stopping: () => stopping,
    stop,
    async close() {
      stopping = true;
      clearInterval(timer);
      await checking;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) =>
        getStatsDClient().close(() => resolve())
      );
      if (drainTimer) {
        clearTimeout(drainTimer);
      }
      process.removeListener("SIGTERM", stop);
      process.removeListener("SIGINT", stop);
    },
  };
}
