import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type {
  Projection,
  ProjectionSession,
  SourceStorage,
} from "@app/workers/gcs_dfs/processor";
import {
  ConfigSchema,
  MessageSchema,
  RelayConfigSchema,
  objectOrderingKey,
} from "@app/workers/gcs_dfs/protocol";
import type { Publisher } from "@app/workers/gcs_dfs/relay";
import { processRelayBatch } from "@app/workers/gcs_dfs/relay";
import { processBatch, runDeliveryLoop } from "@app/workers/gcs_dfs/worker";

const config = RelayConfigSchema.parse({
  subscription: "projects/test/subscriptions/native",
  topic: "projects/test/topics/keyed",
  pubsubEndpoint: "https://europe-west1-pubsub.googleapis.com",
  concurrency: 2,
  bindings: [
    {
      bucket: "private",
      prefix: "w/one/",
      workspaceId: "workspace-one",
      notificationConfigs: ["config"],
    },
  ],
});

function fixture(name = "w/one/file", generation = "2") {
  const metadata = {
    bucket: "private",
    name,
    generation,
    metageneration: "1",
    size: "4",
    updated: "2026-10-09T00:00:00Z",
  };
  const message = MessageSchema.parse({
    ackId: `ack-${name}-${generation}`,
    message: {
      messageId: `id-${name}-${generation}`,
      data: Buffer.from(JSON.stringify(metadata)).toString("base64"),
      attributes: {
        bucketId: metadata.bucket,
        objectId: name,
        objectGeneration: generation,
        notificationConfig: "config",
        payloadFormat: "JSON_API_V1",
        eventType: "OBJECT_FINALIZE",
        eventTime: metadata.updated,
        custom: "preserved",
      },
    },
  });
  const subscription = {
    pull: vi.fn(async () => [message]),
    acknowledge: vi.fn(async (_ids: string[]) => {}),
    lease: vi.fn(async (_ids: string[], _seconds: number) => {}),
  };
  return { metadata, message, subscription };
}

function workerConfig() {
  const { topic: _topic, ...common } = config;
  return ConfigSchema.parse({
    ...common,
    orderedDelivery: true,
    bindings: config.bindings.map((binding) => ({
      ...binding,
      tenant: "tenant-one",
      endpoint: "http://127.0.0.1:8080",
      tokenFile: "/unused",
      directoryId: "0190c3a0b1c27d4e8f0a1b2c3d4e5f60",
      stagingDirectoryId: "0190c3a0b1c27d4e8f0a1b2c3d4e5f61",
      writerSubject: "gcs-importer",
      readers: ["reader"],
    })),
  });
}

const storage: SourceStorage = {
  metadata: async (source) => ({ ...fixture().metadata, ...source }),
  content: async function* () {
    yield Buffer.from("body");
  },
};

function projection(): Projection & ProjectionSession {
  const result: Projection & ProjectionSession = {
    withSource: async (_binding, _source, run) => run(result),
    cursor: vi.fn(async () => null),
    stage: vi.fn(async () => {}),
    publish: vi.fn<ProjectionSession["publish"]>(async () => "applied"),
  };
  return result;
}

describe("keyed GCS relay", () => {
  it("preserves the envelope and acknowledges only after confirmed keyed publication", async () => {
    const test = fixture("w/one/é/file", "1");
    const expected = `gcs-workspace-object-v1:${createHash("sha256")
      .update(JSON.stringify(["workspace-one", "w/one/é/file"]))
      .digest("hex")}`;
    const publisher = {
      publish: vi.fn<Publisher["publish"]>(async (topic, message, key) => {
        expect(topic).toBe(config.topic);
        expect(message).toEqual(test.message.message);
        expect(key).toBe(expected);
        expect(test.subscription.acknowledge).not.toHaveBeenCalled();
      }),
    };
    expect(
      await processRelayBatch(
        [test.message],
        config,
        test.subscription,
        publisher
      )
    ).toMatchObject({ published: 1, failed: 0 });
    expect(test.subscription.acknowledge).toHaveBeenCalledWith([
      test.message.ackId,
    ]);
    expect(objectOrderingKey("workspace-one", "w/one/é/file")).not.toBe(
      objectOrderingKey("workspace-two", "w/one/é/file")
    );
  });

  it("leaves ambiguous publishes and unknown mappings recoverable", async () => {
    const test = fixture();
    const publisher = {
      publish: vi.fn<Publisher["publish"]>(async () => {
        throw new Error("timeout after publish");
      }),
    };
    expect(
      await processRelayBatch(
        [test.message],
        config,
        test.subscription,
        publisher
      )
    ).toMatchObject({ failed: 1 });
    expect(test.subscription.acknowledge).not.toHaveBeenCalled();
    publisher.publish.mockClear();
    const unknown = fixture("w/unknown/file");
    expect(
      await processRelayBatch(
        [unknown.message],
        config,
        test.subscription,
        publisher
      )
    ).toMatchObject({ failed: 1 });
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(test.subscription.acknowledge).not.toHaveBeenCalled();
  });

  it("serializes a key while another object progresses", async () => {
    const first = fixture();
    const second = fixture("w/one/file", "3");
    const other = fixture("w/one/other");
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const published: string[] = [];
    const publisher = {
      publish: vi.fn<Publisher["publish"]>(async (_topic, message) => {
        published.push(message.messageId);
        if (message.messageId === first.message.message.messageId) {
          await gate;
        }
      }),
    };
    const pending = processRelayBatch(
      [first.message, second.message, other.message],
      config,
      first.subscription,
      publisher
    );
    try {
      await vi.waitFor(() =>
        expect(published).toContain(other.message.message.messageId)
      );
      expect(published).not.toContain(second.message.message.messageId);
    } finally {
      release();
    }
    expect(await pending).toMatchObject({ published: 3 });
    expect(publisher.publish.mock.calls[0][2]).toBe(
      publisher.publish.mock.calls[2][2]
    );
  });

  it("rejects insecure routing settings and importer secrets on the relay", () => {
    expect(() =>
      RelayConfigSchema.parse({
        ...config,
        pubsubEndpoint: "https://pubsub.googleapis.com",
      })
    ).toThrow();
    expect(() =>
      RelayConfigSchema.parse({
        ...config,
        pubsubEndpoint: "https://attacker.example",
      })
    ).toThrow();
    expect(() =>
      RelayConfigSchema.parse({
        ...config,
        bindings: [{ ...config.bindings[0], tokenFile: "/secret" }],
      })
    ).toThrow();
    expect(() =>
      RelayConfigSchema.parse({
        ...config,
        bindings: [config.bindings[0], config.bindings[0]],
      })
    ).toThrow();
  });
});

describe("ordered DFS processing", () => {
  it("rejects missing or forged keys before reading either backend", async () => {
    const test = fixture();
    const dfs = projection();
    const settings = workerConfig();
    expect(
      await processBatch(
        [test.message],
        settings,
        test.subscription,
        storage,
        dfs
      )
    ).toMatchObject({ failed: 1 });
    expect(dfs.cursor).not.toHaveBeenCalled();
    const forged = {
      ...test.message,
      message: {
        ...test.message.message,
        orderingKey: objectOrderingKey("another-workspace", test.metadata.name),
      },
    };
    expect(
      await processBatch([forged], settings, test.subscription, storage, dfs)
    ).toMatchObject({ failed: 1 });
    expect(dfs.cursor).not.toHaveBeenCalled();
    expect(test.subscription.acknowledge).not.toHaveBeenCalled();
  });

  it("accepts relayed events and reconciles live state instead of old payload state", async () => {
    const test = fixture("w/one/file", "9");
    const dfs = projection();
    const publisher = {
      publish: vi.fn<Publisher["publish"]>(
        async (_topic, message, orderingKey) => {
          const relayed = {
            ...test.message,
            message: { ...message, orderingKey },
          };
          expect(
            await processBatch(
              [relayed],
              workerConfig(),
              test.subscription,
              storage,
              dfs
            )
          ).toMatchObject({ applied: 1 });
        }
      ),
    };
    await processRelayBatch(
      [test.message],
      config,
      test.subscription,
      publisher
    );
    expect(dfs.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ generation: "2" })
    );
  });

  it("returns messages from a pull completed after shutdown without admitting them", async () => {
    const test = fixture();
    let stopping = false;
    test.subscription.pull.mockImplementation(async () => {
      stopping = true;
      return [test.message];
    });
    const batch = vi.fn(async () => {});
    await runDeliveryLoop(test.subscription, batch, () => stopping);
    expect(batch).not.toHaveBeenCalled();
    expect(test.subscription.lease).toHaveBeenCalledWith(
      [test.message.ackId],
      0
    );
  });
});
