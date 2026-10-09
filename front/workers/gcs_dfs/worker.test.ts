import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { Projection, SourceStorage } from "@app/workers/gcs_dfs/processor";
import {
  CHUNK_BYTES,
  ConfigSchema,
  GcsDfsError,
} from "@app/workers/gcs_dfs/protocol";
import type {
  Message,
  Metadata,
  Publication,
} from "@app/workers/gcs_dfs/protocol";
import { processBatch } from "@app/workers/gcs_dfs/worker";

const config = ConfigSchema.parse({
  subscription: "projects/dust-dev/subscriptions/test",
  concurrency: 2,
  bindings: [
    {
      bucket: "bucket",
      prefix: "w/one/",
      tenant: "one",
      endpoint: "http://127.0.0.1:8080",
      tokenFile: "/unused",
      readers: ["reader"],
      notificationConfigs: ["config"],
    },
  ],
});

function fixture(
  overrides: Partial<Metadata> = {},
  eventType = "OBJECT_FINALIZE"
) {
  const bytes = Buffer.from("document body");
  const metadata = {
    bucket: "bucket",
    name: "w/one/a/b",
    generation: "9007199254740993",
    metageneration: "1",
    size: String(bytes.length),
    updated: "2026-10-08T00:00:00.000Z",
    ...overrides,
  };
  const message: Message = {
    ackId: "ack",
    message: {
      messageId: "message",
      data: Buffer.from(JSON.stringify(metadata)).toString("base64"),
      attributes: {
        eventType,
        payloadFormat: "JSON_API_V1",
        notificationConfig: "config",
        eventTime: metadata.updated,
        bucketId: metadata.bucket,
        objectId: metadata.name,
        objectGeneration: metadata.generation,
      },
    },
  };
  const storage: SourceStorage = {
    metadata: vi.fn(async () => metadata),
    content: vi.fn(async function* () {
      yield bytes;
    }),
  };
  const projection: Projection = {
    cursor: vi.fn(async () => null),
    stage: vi.fn(async () => {}),
    publish: vi.fn<Projection["publish"]>(async () => "applied"),
  };
  const subscription = {
    pull: vi.fn(async () => [message]),
    acknowledge: vi.fn(async () => {}),
    lease: vi.fn(async () => {}),
  };
  return { message, metadata, bytes, storage, projection, subscription };
}

describe("GCS DFS worker delivery", () => {
  it("stages exact bytes and acknowledges only after durable publication", async () => {
    const test = fixture();
    test.projection.publish = vi.fn<Projection["publish"]>(
      async (binding, publication: Publication) => {
        expect(binding.tenant).toBe("one");
        expect(publication.generation).toBe("9007199254740993");
        expect(publication.chunks).toEqual([
          createHash("sha256").update(test.bytes).digest("hex"),
        ]);
        expect(publication.readers).toEqual(["reader"]);
        expect(test.subscription.acknowledge).not.toHaveBeenCalled();
        expect(test.projection.stage).toHaveBeenCalledOnce();
        return "applied";
      }
    );
    expect(
      await processBatch(
        [test.message],
        config,
        test.subscription,
        test.storage,
        test.projection
      )
    ).toMatchObject({ applied: 1, failed: 0 });
    expect(test.subscription.acknowledge).toHaveBeenCalledWith(["ack"]);
  });

  it("preserves bytes across source-stream and staging boundaries", async () => {
    const bytes = Buffer.alloc(CHUNK_BYTES * 2 + 17, 42);
    bytes[CHUNK_BYTES] = 99;
    const test = fixture({ size: String(bytes.length) });
    test.storage.content = vi.fn(async function* () {
      yield bytes.subarray(0, CHUNK_BYTES + 3);
      yield bytes.subarray(CHUNK_BYTES + 3);
    });
    const staged: Buffer[] = [];
    test.projection.stage = vi.fn(async (_binding, hash, chunk) => {
      expect(createHash("sha256").update(chunk).digest("hex")).toBe(hash);
      staged.push(Buffer.from(chunk));
    });
    await processBatch(
      [test.message],
      config,
      test.subscription,
      test.storage,
      test.projection
    );
    expect(staged.map((chunk) => chunk.length)).toEqual([
      CHUNK_BYTES,
      CHUNK_BYTES,
      17,
    ]);
    expect(Buffer.concat(staged)).toEqual(bytes);
    expect(test.subscription.acknowledge).toHaveBeenCalledOnce();
  });

  it("retains a truncated object for retry instead of publishing partial bytes", async () => {
    const test = fixture({ size: "100" });
    expect(
      await processBatch(
        [test.message],
        config,
        test.subscription,
        test.storage,
        test.projection
      )
    ).toMatchObject({ failed: 1 });
    expect(test.projection.publish).not.toHaveBeenCalled();
    expect(test.subscription.acknowledge).not.toHaveBeenCalled();
  });

  it("leaves publication failures and untrusted notifications unacknowledged", async () => {
    const test = fixture();
    test.projection.publish = vi.fn<Projection["publish"]>(async () => {
      throw new Error("external DFS unavailable");
    });
    expect(
      await processBatch(
        [test.message],
        config,
        test.subscription,
        test.storage,
        test.projection
      )
    ).toMatchObject({ failed: 1 });
    expect(test.subscription.acknowledge).not.toHaveBeenCalled();
    const alien = fixture({ name: "w/two/private" });
    expect(
      await processBatch(
        [alien.message],
        config,
        alien.subscription,
        alien.storage,
        alien.projection
      )
    ).toMatchObject({ failed: 1 });
    expect(alien.storage.metadata).not.toHaveBeenCalled();
    expect(alien.projection.publish).not.toHaveBeenCalled();
    expect(alien.subscription.acknowledge).not.toHaveBeenCalled();
  });

  it("accepts a smaller replacement generation using a compare-and-swap cursor", async () => {
    const test = fixture();
    const existing = {
      generation: "9007199254740994",
      metageneration: "9",
      deleted: false,
    };
    test.projection.cursor = vi.fn(async () => existing);
    await processBatch(
      [test.message],
      config,
      test.subscription,
      test.storage,
      test.projection
    );
    expect(test.projection.publish).toHaveBeenCalledWith(
      config.bindings[0],
      expect.objectContaining({
        expected: existing,
        generation: "9007199254740993",
        deleted: false,
      })
    );
    expect(test.storage.metadata).toHaveBeenCalledWith({
      bucket: "bucket",
      name: "w/one/a/b",
    });
  });

  it("re-reads both DFS and live GCS after a competing publication", async () => {
    const test = fixture();
    const published = { generation: "42", metageneration: "1", deleted: false };
    test.projection.publish = vi.fn<Projection["publish"]>(async () => {
      test.projection.cursor = vi.fn(async () => published);
      test.storage.metadata = vi.fn(async () => ({
        ...test.metadata,
        ...published,
      }));
      throw new GcsDfsError("source_cursor_changed");
    });
    expect(
      await processBatch(
        [test.message],
        config,
        test.subscription,
        test.storage,
        test.projection
      )
    ).toMatchObject({ stale: 1, failed: 0 });
    expect(test.projection.publish).toHaveBeenCalledOnce();
    expect(test.subscription.acknowledge).toHaveBeenCalledOnce();
  });

  it("does not interpret an old generation delete as deleting the live replacement", async () => {
    const test = fixture({}, "OBJECT_DELETE");
    test.storage.metadata = vi.fn(async () => ({
      ...test.metadata,
      generation: "42",
    }));
    await processBatch(
      [test.message],
      config,
      test.subscription,
      test.storage,
      test.projection
    );
    expect(test.projection.publish).toHaveBeenCalledWith(
      config.bindings[0],
      expect.objectContaining({ generation: "42", deleted: false })
    );
  });

  it("imports the current replacement, never labels bytes with the event generation", async () => {
    const test = fixture();
    const replacement = {
      ...test.metadata,
      generation: "9007199254740995",
      metageneration: "2",
    };
    test.storage.metadata = vi.fn(async (_source, generation) =>
      generation ? null : replacement
    );
    await processBatch(
      [test.message],
      config,
      test.subscription,
      test.storage,
      test.projection
    );
    expect(test.projection.publish).toHaveBeenCalledWith(
      config.bindings[0],
      expect.objectContaining({
        generation: replacement.generation,
        metageneration: "2",
        deleted: false,
      })
    );
  });

  it.each(["OBJECT_DELETE", "OBJECT_ARCHIVE"])(
    "reconciles %s against confirmed live absence",
    async (event) => {
      const test = fixture({}, event);
      test.storage.metadata = vi.fn(async () => null);
      await processBatch(
        [test.message],
        config,
        test.subscription,
        test.storage,
        test.projection
      );
      expect(test.storage.content).not.toHaveBeenCalled();
      expect(test.projection.publish).toHaveBeenCalledWith(
        config.bindings[0],
        expect.objectContaining({
          deleted: true,
          size: 0,
          chunks: [],
          readers: [],
        })
      );
    }
  );

  it("does not turn a source read failure into deletion", async () => {
    const test = fixture({}, "OBJECT_DELETE");
    test.storage.metadata = vi.fn(async () => {
      throw new Error("GCS permission denied");
    });
    expect(
      await processBatch(
        [test.message],
        config,
        test.subscription,
        test.storage,
        test.projection
      )
    ).toMatchObject({ failed: 1 });
    expect(test.projection.publish).not.toHaveBeenCalled();
    expect(test.subscription.acknowledge).not.toHaveBeenCalled();
  });

  it("turns confirmed source absence into a durable tombstone", async () => {
    const test = fixture();
    test.storage.metadata = vi.fn(async () => null);
    await processBatch(
      [test.message],
      config,
      test.subscription,
      test.storage,
      test.projection
    );
    expect(test.projection.publish).toHaveBeenCalledWith(
      config.bindings[0],
      expect.objectContaining({ deleted: true })
    );
  });

  it("rejects payload identity mismatches, overlapping ownership, and insecure transport", async () => {
    const test = fixture();
    const invalid = {
      ...test.message,
      message: {
        ...test.message.message,
        attributes: { ...test.message.message.attributes, bucketId: "other" },
      },
    };
    await processBatch(
      [invalid],
      config,
      test.subscription,
      test.storage,
      test.projection
    );
    expect(test.projection.cursor).not.toHaveBeenCalled();
    expect(
      ConfigSchema.safeParse({
        ...config,
        bindings: [
          config.bindings[0],
          { ...config.bindings[0], prefix: "w/one/private/" },
        ],
      }).success
    ).toBe(false);
    expect(
      ConfigSchema.safeParse({
        ...config,
        bindings: [{ ...config.bindings[0], endpoint: "http://remote:8080" }],
      }).success
    ).toBe(false);
  });

  it("renews leases while a publication is pending", async () => {
    vi.useFakeTimers();
    try {
      const test = fixture();
      let finish: ((value: "applied") => void) | undefined;
      test.projection.publish = vi.fn<Projection["publish"]>(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const batch = processBatch(
        [test.message],
        config,
        test.subscription,
        test.storage,
        test.projection
      );
      await vi.advanceTimersByTimeAsync(40_000);
      expect(test.subscription.lease.mock.calls.length).toBeGreaterThanOrEqual(
        3
      );
      expect(test.subscription.acknowledge).not.toHaveBeenCalled();
      finish?.("applied");
      await batch;
      expect(test.subscription.acknowledge).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
