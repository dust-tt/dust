import { afterEach, describe, expect, it, vi } from "vitest";

import { CanaryConfigSchema, runCanary } from "@app/workers/gcs_dfs/canary";
import type { CanaryReader } from "@app/workers/gcs_dfs/canary";
import { canaryConfig } from "@app/workers/gcs_dfs/canary.test_helpers";

function fixture() {
  const source = { bucket: "private", name: "files/w/workspace/file/original" };
  let bytes: string | null = null;
  const bodies: string[] = [];
  const producer = {
    create: vi.fn(async (body: string) => {
      bytes = body;
      bodies.push(body);
      return source;
    }),
    update: vi.fn(async (body: string) => {
      bytes = body;
      bodies.push(body);
    }),
    remove: vi.fn(async () => {
      bytes = null;
    }),
  };
  const reader = {
    read: vi.fn<CanaryReader["read"]>(async (_source, reader) =>
      reader === "denied"
        ? { status: "denied" }
        : bytes === null
          ? { status: "missing" }
          : { status: "found", bytes: Buffer.from(bytes) }
    ),
    sourceExists: vi.fn(async () => bytes !== null),
  };
  const observe = vi.fn();
  const producerObserve = vi.fn();
  const run = () =>
    runCanary(
      { deadlineSeconds: 1, pollSeconds: 1 },
      producer,
      reader,
      observe,
      producerObserve,
      async () => {
        await vi.advanceTimersByTimeAsync(1000);
      }
    );
  return { source, producer, reader, observe, producerObserve, run, bodies };
}

afterEach(() => vi.useRealTimers());

describe("front canary evidence", () => {
  it("checks new bytes and denied access after each write, then verifies deletion and cleanup", async () => {
    const test = fixture();
    const result = await test.run();
    expect(result.map((check) => [check.operation, check.healthy])).toEqual([
      ["canary_create", true],
      ["canary_update", true],
      ["canary_delete", true],
      ["canary_cleanup", true],
    ]);
    expect(test.bodies[0]).not.toEqual(test.bodies[1]);
    expect(test.reader.read.mock.calls.map((call) => call[1])).toEqual([
      "allowed",
      "denied",
      "allowed",
      "denied",
      "allowed",
    ]);
    expect(test.producer.remove).toHaveBeenCalledTimes(2);
    expect(
      test.producerObserve.mock.calls.map((call) => call[0].operation)
    ).toEqual(["create", "update", "delete"]);
  });

  it.each(["found", "missing"] as const)(
    "fails when the denied reader returns %s",
    async (status) => {
      const test = fixture();
      const read = test.reader.read.getMockImplementation()!;
      test.reader.read.mockImplementation(async (source, reader) =>
        reader === "denied"
          ? status === "found"
            ? { status, bytes: Buffer.from("leaked") }
            : { status }
          : read(source, reader)
      );
      expect((await test.run())[0].healthy).toBe(false);
      expect(test.producer.update).not.toHaveBeenCalled();
      expect(test.producer.remove).toHaveBeenCalledOnce();
    }
  );

  it("does not accept stale content and still cleans up", async () => {
    vi.useFakeTimers();
    const test = fixture();
    test.reader.read.mockResolvedValue({
      status: "found",
      bytes: Buffer.from("old nonce"),
    });
    expect((await test.run())[0].healthy).toBe(false);
    expect(test.producer.remove).toHaveBeenCalledOnce();
  });

  it("fails deletion while the source still exists", async () => {
    vi.useFakeTimers();
    const test = fixture();
    test.reader.sourceExists.mockResolvedValue(true);
    expect(
      (await test.run()).find((check) => check.operation === "canary_delete")
        ?.healthy
    ).toBe(false);
  });

  it("fails deletion while DFS still has the object", async () => {
    vi.useFakeTimers();
    const test = fixture();
    test.producer.remove.mockResolvedValue(undefined);
    expect(
      (await test.run()).find((check) => check.operation === "canary_delete")
        ?.healthy
    ).toBe(false);
  });

  it("reports failed or ambiguous writes and attempts cleanup", async () => {
    const test = fixture();
    test.producer.create.mockRejectedValue(new Error("ambiguous upload"));
    expect((await test.run())[0].healthy).toBe(false);
    expect(test.producerObserve).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "create", outcome: "error" })
    );
    expect(test.producer.remove).toHaveBeenCalledOnce();
  });

  it("fails closed on unavailable reader or cleanup", async () => {
    const test = fixture();
    test.reader.read.mockRejectedValue(new Error("unavailable"));
    test.producer.remove.mockRejectedValue(new Error("cleanup failed"));
    expect((await test.run()).map((check) => check.healthy)).toEqual([
      false,
      false,
    ]);
  });

  it("stops admission on cancellation and attempts cleanup", async () => {
    const test = fixture();
    const result = await runCanary(
      canaryConfig(),
      test.producer,
      test.reader,
      test.observe,
      test.producerObserve,
      undefined,
      AbortSignal.abort()
    );
    expect(result[0].healthy).toBe(false);
    expect(test.producer.create).not.toHaveBeenCalled();
    expect(test.producer.remove).toHaveBeenCalledOnce();
  });

  it("rejects global routing, importer secrets, overlapping hops and broad source prefixes", () => {
    const config = canaryConfig();
    for (const candidate of [
      { ...config, pubsubEndpoint: "https://pubsub.googleapis.com" },
      { ...config, binding: { ...config.binding, tokenFile: "/admin" } },
      { ...config, binding: { ...config.binding, prefix: "files/" } },
      { ...config, worker: config.relay },
    ]) {
      expect(CanaryConfigSchema.safeParse(candidate).success).toBe(false);
    }
  });
});
