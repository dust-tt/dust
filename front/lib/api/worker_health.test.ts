import type { Server } from "node:http";
import { createWorkerHealthServer } from "@app/lib/api/worker_health";
import { isString } from "@app/types/shared/utils/general";
import { afterEach, describe, expect, it } from "vitest";

describe("worker health server", () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }

      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });

  it("serves a minimal liveness endpoint", async () => {
    const healthServer = createWorkerHealthServer();
    server = healthServer;
    await new Promise<void>((resolve, reject) => {
      healthServer.once("error", reject);
      healthServer.listen(0, "127.0.0.1", resolve);
    });

    const address = healthServer.address();
    if (!address || isString(address)) {
      throw new Error("Worker health server did not bind to a TCP port.");
    }

    const healthResponse = await fetch(
      `http://127.0.0.1:${address.port}/healthz`
    );
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.text()).toBe("ok");

    const unknownResponse = await fetch(
      `http://127.0.0.1:${address.port}/unknown`
    );
    expect(unknownResponse.status).toBe(404);
  });
});
