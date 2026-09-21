import { createHash, randomUUID } from "node:crypto";

import { closeRedisClients, getRedisStreamClient } from "@app/lib/api/redis";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { StorageTransferService } from "@app/temporal/relocation/lib/file_storage/transfer";
import type { PooledTransferConfig } from "@app/temporal/relocation/lib/file_storage/transfer_pool";
import { protos } from "@google-cloud/storage-transfer";
import type { google } from "@google-cloud/storage-transfer/build/protos/protos";
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

vi.unmock("@app/lib/api/redis");

const sts = vi.hoisted(() => ({
  createTransferJob: vi.fn(),
  getTransferJob: vi.fn(),
  updateTransferJob: vi.fn(),
  runTransferJob: vi.fn(),
  getOperation: vi.fn(),
  listOperationsAsync: vi.fn(),
}));

vi.mock("@google-cloud/storage-transfer", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@google-cloud/storage-transfer")>();
  return {
    ...actual,
    StorageTransferServiceClient: class {
      createTransferJob = sts.createTransferJob;
      getTransferJob = sts.getTransferJob;
      updateTransferJob = sts.updateTransferJob;
      runTransferJob = sts.runTransferJob;
      getOperation = sts.getOperation;
      listOperationsAsync = sts.listOperationsAsync;
    },
  };
});

type Job = google.storagetransfer.v1.ITransferJob;
type Operation = google.longrunning.IOperation;

const jobs = new Map<string, Job>();
const operations = new Map<string, Operation>();
const operationJobs = new Map<string, string>();
const specs = new Map<string, Job["transferSpec"]>();
const service = new StorageTransferService();
let workspaceId: string;
let poolKey: string;

function request(index: number): PooledTransferConfig {
  return {
    workspaceId,
    transferProjectId: "test-transfer-project",
    sourceCell: "cell-00000",
    destCell: "cell-00001",
    sourceBucket: "source-tables",
    destBucket: "destination-tables",
    sourcePath: `source-${index}/`,
    destPath: `destination-${index}/`,
  };
}

function finishOperations() {
  for (const operation of operations.values()) {
    operation.done = true;
  }
}

describe("relocation transfer job pool", () => {
  beforeAll(async () => {
    await getRedisStreamClient({ origin: "lock" });
  });

  beforeEach(() => {
    jobs.clear();
    operations.clear();
    operationJobs.clear();
    specs.clear();
    workspaceId = `test-${randomUUID()}`;
    const config = request(0);
    const poolId = createHash("sha256")
      .update(
        JSON.stringify([
          workspaceId,
          config.transferProjectId,
          config.sourceCell,
          config.destCell,
          config.sourceBucket,
          config.destBucket,
        ])
      )
      .digest("hex");
    poolKey = `relocation:table-transfers:${poolId}`;

    sts.getTransferJob.mockImplementation(
      async ({ jobName }: { jobName: string }) => {
        const job = jobs.get(jobName);
        if (!job) {
          throw Object.assign(new Error("Not found"), { code: 5 });
        }
        return [structuredClone(job)];
      }
    );
    sts.createTransferJob.mockImplementation(
      async ({ transferJob }: { transferJob: Job }) => {
        const name = transferJob.name!;
        if (jobs.has(name)) {
          throw Object.assign(new Error("Already exists"), { code: 6 });
        }
        expect(transferJob.schedule).toBeUndefined();
        expect(transferJob.status).toBe("ENABLED");
        jobs.set(name, structuredClone(transferJob));
        return [transferJob];
      }
    );
    sts.updateTransferJob.mockImplementation(
      async ({
        jobName,
        transferJob,
      }: {
        jobName: string;
        transferJob: Job;
      }) => {
        const job = jobs.get(jobName)!;
        expect(Object.keys(transferJob)).toEqual(["transferSpec"]);
        const updated = { ...job, ...transferJob };
        jobs.set(jobName, updated);
        return [updated];
      }
    );
    sts.runTransferJob.mockImplementation(
      async ({ jobName }: { jobName: string }) => {
        const job = jobs.get(jobName)!;
        const name = `transferOperations/test-${operations.size}`;
        const active = [...operations].some(
          ([operationName, operation]) =>
            operationJobs.get(operationName) === jobName && !operation.done
        );
        if (active) {
          throw Object.assign(new Error("Transfer job already running"), {
            code: 9,
          });
        }
        const operation: Operation = {
          name,
          done: false,
          metadata: {
            type_url:
              protos.google.storagetransfer.v1.TransferOperation.getTypeUrl(),
            value: protos.google.storagetransfer.v1.TransferOperation.encode({
              transferJobName: jobName,
              transferSpec: job.transferSpec,
            }).finish(),
          },
        };
        operations.set(name, operation);
        operationJobs.set(name, jobName);
        specs.set(name, structuredClone(job.transferSpec));
        jobs.set(jobName, { ...job, latestOperationName: name });
        return [operation];
      }
    );
    sts.getOperation.mockImplementation(async ({ name }: { name: string }) => [
      operations.get(name),
    ]);
    sts.listOperationsAsync.mockImplementation(async function* ({
      name,
      filter,
      pageSize,
    }: google.longrunning.IListOperationsRequest) {
      expect(name).toBe("transferOperations");
      expect(pageSize).toBe(1);
      const query = JSON.parse(filter!);
      expect(query.projectId).toBe(request(0).transferProjectId);
      expect(query.jobNames).toHaveLength(1);
      for (const [operationName, operation] of [...operations].reverse()) {
        if (operationJobs.get(operationName) === query.jobNames[0]) {
          yield structuredClone(operation);
        }
      }
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const redis = await getRedisStreamClient({ origin: "lock" });
    await redis.del([poolKey, `lock:${poolKey}`]);
  });

  afterAll(closeRedisClients);

  it("starts 20 concurrent transfers, refuses a 21st, then reuses a completed job", async () => {
    const results = await concurrentExecutor(
      Array.from({ length: 20 }, (_, index) => index),
      (index) => service.startPooledTransfer(request(index)),
      { concurrency: 20 }
    );
    expect(results.every((result) => result.isOk())).toBe(true);
    expect(jobs.size).toBe(20);
    for (const [index, result] of results.entries()) {
      if (result.isOk()) {
        expect(specs.get(result.value)?.gcsDataSource?.path).toBe(
          request(index).sourcePath
        );
        expect(specs.get(result.value)?.gcsDataSink?.path).toBe(
          request(index).destPath
        );
      }
    }
    const full = await service.startPooledTransfer(request(20));
    expect(full.isErr() && full.error.message).toContain("busy");
    const reads = sts.getTransferJob.mock.calls.length;
    await service.startPooledTransfer(request(21));
    expect(sts.getTransferJob).toHaveBeenCalledTimes(reads);
    finishOperations();
    const nowMs = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(nowMs + 31_000);
    const next = await service.startPooledTransfer(request(20));
    expect(next.isOk()).toBe(true);
    expect(sts.createTransferJob).toHaveBeenCalledTimes(20);
    expect(sts.updateTransferJob).toHaveBeenCalledTimes(1);
    expect(operations.size).toBe(21);
    await expect(service.startPooledTransfer(request(0))).resolves.toEqual(
      results[0]
    );
  });

  it("returns the same operation to concurrent retries of one request", async () => {
    const results = await Promise.all([
      service.startPooledTransfer(request(0)),
      service.startPooledTransfer(request(0)),
      service.startPooledTransfer(request(0)),
    ]);
    expect(results[0].isOk()).toBe(true);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(sts.runTransferJob).toHaveBeenCalledTimes(1);
    const redis = await getRedisStreamClient({ origin: "lock" });
    expect(await redis.ttl(poolKey)).toBeGreaterThan(29 * 24 * 60 * 60);
  });

  it("recovers a lost run response before processing another prefix", async () => {
    const run = sts.runTransferJob.getMockImplementation()!;
    sts.runTransferJob.mockImplementationOnce(async (...args) => {
      await run(...args);
      throw new Error("Connection lost after STS accepted the run");
    });
    expect((await service.startPooledTransfer(request(0))).isErr()).toBe(true);
    finishOperations();
    expect((await service.startPooledTransfer(request(1))).isOk()).toBe(true);
    const retry = await service.startPooledTransfer(request(0));
    expect(retry.isOk() && retry.value).toBe("transferOperations/test-0");
    expect(sts.runTransferJob).toHaveBeenCalledTimes(2);
  });

  it("reuses a job after its creation response is lost", async () => {
    const create = sts.createTransferJob.getMockImplementation()!;
    sts.createTransferJob.mockImplementationOnce(async (...args) => {
      await create(...args);
      throw new Error("Connection lost after creation");
    });
    expect((await service.startPooledTransfer(request(0))).isErr()).toBe(true);
    expect((await service.startPooledTransfer(request(0))).isOk()).toBe(true);
    expect(sts.createTransferJob).toHaveBeenCalledTimes(1);
    expect(sts.runTransferJob).toHaveBeenCalledTimes(1);
  });

  it.each([
    false,
    true,
  ])("recovers a lost run with stale job metadata and done=%s", async (done) => {
    for (let index = 0; index < 20; index++) {
      expect((await service.startPooledTransfer(request(index))).isOk()).toBe(
        true
      );
    }
    finishOperations();
    const run = sts.runTransferJob.getMockImplementation()!;
    sts.runTransferJob.mockImplementationOnce(async ({ jobName }) => {
      const previous = structuredClone(jobs.get(jobName)!);
      const [operation] = await run({ jobName });
      operation.done = done;
      jobs.set(jobName, previous);
      throw new Error("Connection lost after STS accepted the run");
    });
    expect((await service.startPooledTransfer(request(20))).isErr()).toBe(true);

    const retry = await service.startPooledTransfer(request(20));
    expect(retry.isOk() && retry.value).toBe("transferOperations/test-20");
    expect(sts.listOperationsAsync).toHaveBeenCalledTimes(1);
    expect(sts.updateTransferJob).toHaveBeenCalledTimes(1);
    expect(sts.runTransferJob).toHaveBeenCalledTimes(21);
  });

  it("starts an already configured job when the first run never reached STS", async () => {
    sts.runTransferJob.mockRejectedValueOnce(new Error("Connection refused"));
    expect((await service.startPooledTransfer(request(0))).isErr()).toBe(true);

    const retry = await service.startPooledTransfer(request(0));
    expect(retry.isOk() && retry.value).toBe("transferOperations/test-0");
    expect(sts.createTransferJob).toHaveBeenCalledTimes(1);
    expect(sts.updateTransferJob).not.toHaveBeenCalled();
    expect(sts.runTransferJob).toHaveBeenCalledTimes(2);
  });

  it("keeps the pending prefix when both STS reads lag behind an accepted run", async () => {
    const run = sts.runTransferJob.getMockImplementation()!;
    sts.runTransferJob.mockImplementationOnce(async ({ jobName }) => {
      await run({ jobName });
      jobs.set(jobName, { ...jobs.get(jobName), latestOperationName: null });
      throw new Error("Connection lost after STS accepted the run");
    });
    expect((await service.startPooledTransfer(request(0))).isErr()).toBe(true);
    sts.listOperationsAsync.mockImplementationOnce(async function* () {});

    const retry = await service.startPooledTransfer(request(1));
    expect(retry.isErr() && retry.error.message).toBe(
      "Transfer job already running"
    );
    expect(sts.updateTransferJob).not.toHaveBeenCalled();
    expect(operations.size).toBe(1);
    expect(jobs.size).toBe(1);

    expect((await service.startPooledTransfer(request(1))).isOk()).toBe(true);
    const recovered = await service.startPooledTransfer(request(0));
    expect(recovered.isOk() && recovered.value).toBe(
      "transferOperations/test-0"
    );
    expect(specs.get("transferOperations/test-0")?.gcsDataSource?.path).toBe(
      "source-0/"
    );
  });

  it("rejects an operation from a different prefix during recovery", async () => {
    sts.runTransferJob.mockRejectedValueOnce(new Error("Connection refused"));
    expect((await service.startPooledTransfer(request(0))).isErr()).toBe(true);
    const jobName = [...jobs.keys()][0];
    const operation: Operation = {
      name: "transferOperations/older",
      done: true,
      metadata: {
        value: protos.google.storagetransfer.v1.TransferOperation.encode({
          transferJobName: jobName,
          transferSpec: {
            gcsDataSource: {
              bucketName: "source-tables",
              path: "another-prefix/",
            },
          },
        }).finish(),
      },
    };
    operations.set(operation.name!, operation);
    operationJobs.set(operation.name!, jobName);

    const retry = await service.startPooledTransfer(request(0));
    expect(retry.isErr() && retry.error.message).toContain(
      "does not match pending prefix"
    );
    expect(sts.updateTransferJob).not.toHaveBeenCalled();
    expect(sts.runTransferJob).toHaveBeenCalledTimes(1);
  });

  it("recovers when Redis fails to record a started operation", async () => {
    const redis = await getRedisStreamClient({ origin: "lock" });
    const evalCommand = redis.eval.bind(redis);
    vi.spyOn(redis, "eval")
      .mockImplementationOnce(evalCommand)
      .mockImplementationOnce(evalCommand)
      .mockRejectedValueOnce(new Error("Redis unavailable"));

    expect((await service.startPooledTransfer(request(0))).isErr()).toBe(true);
    finishOperations();
    const retry = await service.startPooledTransfer(request(0));
    expect(retry.isOk() && retry.value).toBe("transferOperations/test-0");
    expect(sts.runTransferJob).toHaveBeenCalledTimes(1);
  });

  it.each([
    { stage: "assignment", delayedWrite: 1 },
    { stage: "configuration", delayedWrite: 2 },
    { stage: "completion", delayedWrite: 3 },
  ])("rejects a queued $stage write after another worker takes the lock", async ({
    delayedWrite,
  }) => {
    const redis = await getRedisStreamClient({ origin: "lock" });
    const evalCommand = redis.eval.bind(redis);
    const queued = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let writeCount = 0;
    vi.spyOn(redis, "eval").mockImplementation(async (...args) => {
      const script = args[0];
      if (typeof script === "string" && script.includes('redis.call("hset"')) {
        writeCount++;
        if (writeCount === delayedWrite) {
          queued.resolve();
          await release.promise;
        }
      }
      return evalCommand(...args);
    });

    const oldAttempt = service.startPooledTransfer(request(0));
    await queued.promise;
    let otherRequest;
    try {
      // Expire the old lease while its Redis command is still queued.
      await redis.pExpire(`lock:${poolKey}`, 0);
      otherRequest = await service.startPooledTransfer(request(1));
    } finally {
      release.resolve();
    }
    const stale = await oldAttempt;
    expect(stale.isErr() && stale.error.message).toContain("lock expired");
    expect(otherRequest.isOk()).toBe(true);
    expect(await redis.hGet(poolKey, "pending")).toBe("");

    const retry = await service.startPooledTransfer(request(0));
    expect(retry.isOk()).toBe(true);
    if (retry.isOk() && otherRequest.isOk()) {
      expect(retry.value).not.toBe(otherRequest.value);
      expect(specs.get(retry.value)?.gcsDataSource?.path).toBe("source-0/");
      expect(specs.get(otherRequest.value)?.gcsDataSource?.path).toBe(
        "source-1/"
      );
    }
  });

  it("does not refresh the deadline after a delayed lock acquisition reply", async () => {
    const redis = await getRedisStreamClient({ origin: "lock" });
    const setCommand = redis.set.bind(redis);
    const nowMs = Date.now();
    vi.spyOn(redis, "set").mockImplementationOnce(async (...args) => {
      const result = await setCommand(...args);
      vi.spyOn(Date, "now").mockReturnValue(nowMs + 300_000);
      return result;
    });

    const result = await service.startPooledTransfer(request(0));
    expect(result.isErr() && result.error.message).toContain("timed out");
    expect(sts.createTransferJob).not.toHaveBeenCalled();
    expect(sts.updateTransferJob).not.toHaveBeenCalled();
    expect(sts.runTransferJob).not.toHaveBeenCalled();
  });

  it("waits for the returned operation to become visible on its job", async () => {
    for (let index = 0; index < 20; index++) {
      expect((await service.startPooledTransfer(request(index))).isOk()).toBe(
        true
      );
    }
    for (const [name, job] of jobs) {
      jobs.set(name, { ...job, latestOperationName: null });
    }
    const result = await service.startPooledTransfer(request(20));
    expect(result.isErr() && result.error.message).toContain("busy");
    expect(sts.updateTransferJob).not.toHaveBeenCalled();
    expect(sts.runTransferJob).toHaveBeenCalledTimes(20);
  });

  it("retries an unstarted assignment after a patch failure", async () => {
    for (let index = 0; index < 20; index++) {
      expect((await service.startPooledTransfer(request(index))).isOk()).toBe(
        true
      );
    }
    finishOperations();
    sts.updateTransferJob.mockRejectedValueOnce(new Error("Patch failed"));
    expect((await service.startPooledTransfer(request(20))).isErr()).toBe(true);
    expect((await service.startPooledTransfer(request(20))).isOk()).toBe(true);
    expect(specs.get("transferOperations/test-20")?.gcsDataSource?.path).toBe(
      "source-20/"
    );
    expect(sts.createTransferJob).toHaveBeenCalledTimes(20);
    expect(sts.runTransferJob).toHaveBeenCalledTimes(21);
  });

  it("fails closed on STS read errors", async () => {
    sts.getTransferJob.mockRejectedValueOnce(
      Object.assign(new Error("Permission denied"), { code: 7 })
    );
    const result = await service.startPooledTransfer(request(0));
    expect(result.isErr() && result.error.message).toBe("Permission denied");
    expect(sts.createTransferJob).not.toHaveBeenCalled();
    expect(sts.runTransferJob).not.toHaveBeenCalled();
  });

  it("stops mutating before the lock lease can expire", async () => {
    const nowMs = Date.now();
    sts.getTransferJob.mockImplementationOnce(async () => {
      vi.spyOn(Date, "now").mockReturnValue(nowMs + 300_000);
      throw Object.assign(new Error("Not found"), { code: 5 });
    });
    const result = await service.startPooledTransfer(request(0));
    expect(result.isErr() && result.error.message).toContain("timed out");
    expect(sts.createTransferJob).not.toHaveBeenCalled();
    expect(sts.runTransferJob).not.toHaveBeenCalled();
  });

  it("polls the original operation after reuse and surfaces its failure", async () => {
    operations.set("transferOperations/original", { done: true });
    await expect(
      service.isTransferOperationDone("transferOperations/original")
    ).resolves.toEqual({ value: true });
    operations.set("transferOperations/original", {
      done: true,
      error: { code: 13, message: "Transfer failed" },
    });
    const result = await service.isTransferOperationDone(
      "transferOperations/original"
    );
    expect(result.isErr()).toBe(true);
    expect(sts.getTransferJob).not.toHaveBeenCalled();
  });
});
