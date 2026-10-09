import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  deferred,
  testDfs,
  testRedis,
} from "@app/tests/utils/gcs_dfs/import_server";
import { RedisImportCoordinator } from "@app/workers/gcs_dfs/coordination";
import { processNotification } from "@app/workers/gcs_dfs/processor";
import type { SourceStorage } from "@app/workers/gcs_dfs/processor";
import { DfsProjection } from "@app/workers/gcs_dfs/projection";
import { CHUNK_BYTES, projectionName } from "@app/workers/gcs_dfs/protocol";
import type { Binding, Message, Metadata } from "@app/workers/gcs_dfs/protocol";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

const binding: Binding = {
  bucket: "private",
  prefix: "files/w/workspace/",
  workspaceId: "workspace",
  tenant: "tenant",
  endpoint: "http://127.0.0.1:1",
  tokenFile: "/tenant-key",
  readers: ["reader"],
  directoryId: "0190c3a0b1c27d4e8f0a1b2c3d4e5f60",
  stagingDirectoryId: "0190c3a0b1c27d4e8f0a1b2c3d4e5f61",
  writerSubject: "gcs-importer",
  notificationConfigs: ["notification"],
};
const source = {
  bucket: binding.bucket,
  name: `${binding.prefix}file/original`,
};
const ownershipKey = `gcs-dfs:ownership:v1:${createHash("sha256")
  .update(JSON.stringify([binding.tenant, source.bucket, source.name]))
  .digest("hex")}`;
const original: Metadata = {
  ...source,
  generation: "1",
  metageneration: "1",
  size: "3",
  updated: "2026-10-09T12:00:00Z",
};
const message: Message = {
  ackId: "ack",
  message: {
    messageId: "message",
    data: Buffer.from(JSON.stringify(original)).toString("base64"),
    attributes: {
      eventType: "OBJECT_FINALIZE",
      payloadFormat: "JSON_API_V1",
      bucketId: source.bucket,
      objectId: source.name,
      objectGeneration: original.generation,
      notificationConfig: "notification",
      eventTime: original.updated,
    },
  },
};

let redisFixture: Awaited<ReturnType<typeof testRedis>>;
let server: Awaited<ReturnType<typeof testDfs>>;
const clients: DfsProjection[] = [];
let current: Metadata | null;
let body: Buffer;
const storage: SourceStorage = {
  metadata: vi.fn(async () => current),
  content: async function* () {
    const snapshot = body;
    for (let offset = 0; offset < snapshot.length; offset += CHUNK_BYTES) {
      yield snapshot.subarray(offset, offset + CHUNK_BYTES);
    }
  },
};

beforeAll(async () => {
  redisFixture = await testRedis();
}, 30_000);
afterAll(async () => {
  await redisFixture.close();
}, 30_000);
beforeEach(async () => {
  vi.mocked(readFile).mockResolvedValue("t".repeat(64));
  vi.mocked(storage.metadata).mockClear();
  await redisFixture.redis.flushDb();
  current = { ...original };
  body = Buffer.from("old");
  server = await testDfs(binding);
});
afterEach(() => {
  for (const client of clients.splice(0)) {
    client.close();
  }
  server.close();
});

function client() {
  const client = new DfsProjection(
    new RedisImportCoordinator(redisFixture.redis),
    10_000
  );
  clients.push(client);
  return client;
}
function run(projection = client(), sourceStorage = storage) {
  return processNotification(
    message,
    [{ ...binding, endpoint: server.endpoint }],
    sourceStorage,
    projection
  );
}
function published() {
  return [...server.objects.values()].find(
    (object) =>
      object.parentId === binding.directoryId &&
      object.name === projectionName(source)
  );
}
function change(generation = "2", data = Buffer.from("new")) {
  body = data;
  current = { ...original, generation, size: String(body.length) };
}

async function expireOwnership() {
  expect(await redisFixture.redis.exists(ownershipKey)).toBe(1);
  await redisFixture.redis.hSet(ownershipKey, "untilMs", "0");
}

describe("canonical DFS import with Redis ownership and session fencing", () => {
  it("stages bounded writes privately, then publishes bytes and cursor in one rename", async () => {
    change("1", Buffer.alloc(CHUNK_BYTES + 5, 42));
    server.hooks.beforeApply = async (operation) => {
      if (!("rename" in operation)) {
        expect(published()).toBeUndefined();
      }
    };
    expect(await run()).toBe("applied");
    expect(published()?.bytes).toEqual(body);
    expect(
      JSON.parse(published()?.xattrs["dust.gcs.cursor"].toString() ?? "null")
    ).toEqual({ generation: "1", metageneration: "1", deleted: false });
    expect(
      server.operations.filter((operation) => "write" in operation)
    ).toHaveLength(2);
    expect(server.operations.at(-1)).toHaveProperty("rename");
    expect(
      [...server.sessions.values()].every((session) => session.revoked)
    ).toBe(true);
    expect(await redisFixture.redis.exists(ownershipKey)).toBe(0);
  });

  it("reconciles current GCS state, deduplicates and removes by one existing operation", async () => {
    await run();
    const mutations = server.operations.length;
    expect(await run()).toBe("stale");
    expect(server.operations).toHaveLength(mutations);
    change("9007199254740999");
    await run();
    expect(published()?.bytes.toString()).toBe("new");
    current = null;
    expect(await run()).toBe("applied");
    expect(published()).toBeUndefined();
    expect(server.operations.at(-1)).toHaveProperty("remove");
    expect(await run()).toBe("applied");
    expect(published()).toBeUndefined();
  });

  it("fences a worker paused past lease expiry before its successor reads GCS", async () => {
    const entered = deferred();
    const resume = deferred();
    const blockedStorage: SourceStorage = {
      metadata: storage.metadata,
      content: async function* () {
        entered.resolve();
        await resume.promise;
        yield Buffer.from("old");
      },
    };
    const old = run(client(), blockedStorage).then(
      () => "unexpected success",
      (error: unknown) => error
    );
    await entered.promise;
    await expireOwnership();
    change();
    const previous = [...server.sessions.keys()][0];
    const nextStorage: SourceStorage = {
      ...storage,
      metadata: async () => {
        expect(server.sessions.get(previous)?.revoked).toBe(true);
        return current;
      },
    };
    expect(await run(client(), nextStorage)).toBe("applied");
    resume.resolve();
    expect(await old).toMatchObject({ reason: "ownership_lost" });
    expect(published()?.bytes.toString()).toBe("new");
  });

  it("waits for the previous session's admitted rename before takeover reconciliation", async () => {
    const admitted = deferred();
    const finish = deferred();
    const revoking = deferred();
    let delayed = false;
    server.hooks.beforeApply = async (operation) => {
      if ("rename" in operation && !delayed) {
        delayed = true;
        admitted.resolve();
        await finish.promise;
      }
    };
    const first = run();
    await admitted.promise;
    await expireOwnership();
    change();
    server.hooks.revoke = () => revoking.resolve();
    const second = run();
    await revoking.promise;
    expect(storage.metadata).toHaveBeenCalledTimes(1);
    expect(published()).toBeUndefined();
    finish.resolve();
    expect(await first).toBe("applied");
    expect(await second).toBe("applied");
    expect(storage.metadata).toHaveBeenCalledTimes(2);
    expect(published()?.bytes.toString()).toBe("new");
  });

  it("reobserves after an ambiguous committed rename instead of replaying it", async () => {
    server.hooks.afterApply = (operation) => "rename" in operation;
    await expect(run()).rejects.toMatchObject({ code: "unavailable" });
    expect(published()?.bytes.toString()).toBe("old");
    expect(
      [...server.sessions.values()].every((session) => session.revoked)
    ).toBe(true);
    server.hooks.afterApply = () => false;
    expect(await run()).toBe("stale");
    expect(
      server.operations.filter((operation) => "rename" in operation)
    ).toHaveLength(1);
  });

  it("retains uncertain sessions and blocks successors when revocation fails", async () => {
    server.hooks.failRevoke = true;
    await expect(run()).rejects.toMatchObject({ code: "unavailable" });
    const sessionId = await redisFixture.redis.hGet(ownershipKey, "session");
    expect(sessionId).toBeTruthy();
    expect(storage.metadata).toHaveBeenCalledTimes(1);
    await expect(run()).rejects.toMatchObject({ code: "unavailable" });
    expect(storage.metadata).toHaveBeenCalledTimes(1);
    expect(await redisFixture.redis.hGet(ownershipKey, "session")).toBe(
      sessionId
    );
    server.hooks.failRevoke = false;
    expect(await run()).toBe("stale");
    expect(await redisFixture.redis.exists(ownershipKey)).toBe(0);
  });

  it("keeps the old publication when a staged write fails per operation", async () => {
    await run();
    change();
    server.hooks.failWrite = true;
    await expect(run()).rejects.toMatchObject({ code: "capacity" });
    expect(published()?.bytes.toString()).toBe("old");
    expect(
      server.operations.filter((operation) => "rename" in operation)
    ).toHaveLength(1);
  });

  it("fails closed on grant drift before source reads or mutation", async () => {
    server.hooks.badGrants = true;
    await expect(run()).rejects.toMatchObject({ code: "forbidden" });
    expect(storage.metadata).not.toHaveBeenCalled();
    expect(server.operations).toHaveLength(0);
  });

  it("retains the previous session through takeover and rejects stale registration and release", async () => {
    const coordinator = new RedisImportCoordinator(redisFixture.redis);
    const entered = deferred();
    const resume = deferred();
    const first = coordinator.withOwnership("test", async (ownership) => {
      await ownership.register("previous-session");
      entered.resolve();
      await resume.promise;
      await expect(ownership.register("stale-session")).rejects.toMatchObject({
        reason: "ownership_lost",
      });
    });
    await entered.promise;
    await redisFixture.redis.hSet("gcs-dfs:ownership:v1:test", "untilMs", "0");
    await coordinator.withOwnership("test", async (ownership) => {
      expect(ownership.previousSession).toBe("previous-session");
      await ownership.register("next-session");
      resume.resolve();
      await first;
      await ownership.assert();
    });
    expect(
      await redisFixture.redis.hGet("gcs-dfs:ownership:v1:test", "session")
    ).toBe("next-session");
    expect(await redisFixture.redis.ttl("gcs-dfs:ownership:v1:test")).toBe(-1);
  });

  it("rejects a concurrent holder while the lease remains live", async () => {
    const coordinator = new RedisImportCoordinator(redisFixture.redis);
    await coordinator.withOwnership("test", async () => {
      await expect(
        coordinator.withOwnership("test", async () => {})
      ).rejects.toMatchObject({ reason: "object_busy" });
    });
  });
});
