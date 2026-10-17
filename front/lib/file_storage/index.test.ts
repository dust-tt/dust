import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { getBucketInstance } from "@app/lib/file_storage";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.unmock("@app/lib/file_storage");

describe("FileStorage.file requestTimeoutMs", () => {
  let server: Server;

  beforeAll(async () => {
    // Accepts connections and never answers, like a dead keep-alive connection.
    server = createServer(() => {});
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    vi.stubEnv("STORAGE_EMULATOR_HOST", `http://127.0.0.1:${port}`);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it("fails a stuck simple upload once the request timeout elapses", async () => {
    const bucket = getBucketInstance("request-timeout-upload-bucket", {
      useServiceAccount: false,
    });

    const startMs = Date.now();
    await expect(
      bucket
        .file("stuck.json", { requestTimeoutMs: 200 })
        .save(Buffer.from("{}"), {
          contentType: "application/json",
          resumable: false,
        })
    ).rejects.toThrow(/timeout/);
    expect(Date.now() - startMs).toBeLessThan(5_000);
  });

  it("fails a stuck delete once the request timeout elapses", async () => {
    const bucket = getBucketInstance("request-timeout-delete-bucket", {
      useServiceAccount: false,
    });

    const startMs = Date.now();
    await expect(
      bucket.delete("stuck.json", { requestTimeoutMs: 200 })
    ).rejects.toThrow(/timeout/);
    expect(Date.now() - startMs).toBeLessThan(5_000);
  });

  it("does not apply the timeout to other files of the same bucket", () => {
    const bucket = getBucketInstance("request-timeout-shared-bucket", {
      useServiceAccount: false,
    });

    bucket.file("timed.json", { requestTimeoutMs: 200 });

    expect(bucket.file("timed.json").interceptors).toHaveLength(0);
  });
});
