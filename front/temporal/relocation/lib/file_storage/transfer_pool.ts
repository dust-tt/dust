import { createHash } from "node:crypto";

import type { RedisClientType } from "@app/lib/api/redis";
import { getRedisStreamClient } from "@app/lib/api/redis";
import type { LockOwnership } from "@app/lib/lock";
import { executeWithLockResult } from "@app/lib/lock";
import type { TransferConfig } from "@app/temporal/relocation/lib/file_storage/transfer";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { StorageTransferServiceClient } from "@google-cloud/storage-transfer";
import { protos } from "@google-cloud/storage-transfer";
import type { google } from "@google-cloud/storage-transfer/build/protos/protos";
import { z } from "zod";

// Match the 20 concurrent data source relocations in the Core workflow.
const POOL_SIZE = 20;
// Leave room for RPC timeouts before the Redis lease expires.
const LOCK_TTL_MS = 5 * 60_000;
const START_TIMEOUT_MS = 2 * 60_000;
const LOCK_ACQUIRE_TIMEOUT_MS = 30_000;
// Paused relocations may retry days later.
const STATE_TTL_SECONDS = 30 * 24 * 60 * 60;
// Throttle full-pool scans against STS read quotas.
const BUSY_RETRY_DELAY_MS = 30_000;
// Let Temporal retry so a lost run response is reconciled before another run.
const RPC_OPTIONS = { timeout: 10_000, retry: null };
const TRANSFER_OPERATIONS_COLLECTION = "transferOperations";

export type PooledTransferConfig = Omit<TransferConfig, "includePrefixes"> & {
  sourcePath: string;
  destPath: string;
};

type TransferPool = {
  client: StorageTransferServiceClient;
  redis: RedisClientType;
  config: PooledTransferConfig;
  key: string;
  id: string;
  deadlineMs: number;
  lock: LockOwnership;
};

type AvailableJob = {
  jobName: string;
  previousOperationName: string | null;
  nextSlot: number;
};

const PendingTransferSchema = z.object({
  requestId: z.string(),
  jobName: z.string(),
  previousOperationName: z.string().nullable(),
  sourceBucket: z.string(),
  sourcePath: z.string(),
  destBucket: z.string(),
  destPath: z.string(),
  configured: z.boolean(),
});

type PendingTransfer = z.infer<typeof PendingTransferSchema>;

const OperationNameSchema = z.object({ name: z.string().min(1) });

function hash(parts: string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function checkDeadline(pool: TransferPool): Result<void, Error> {
  return Date.now() >= pool.deadlineMs
    ? new Err(new Error("Transfer pool start timed out"))
    : new Ok(undefined);
}

async function savePoolState(
  pool: TransferPool,
  fields: Record<string, string>
): Promise<Result<void, Error>> {
  const deadline = checkDeadline(pool);
  if (deadline.isErr()) {
    return deadline;
  }
  // Queued writes must not outlive the lease that authorized them.
  const saved = await pool.redis.eval(
    `if redis.call("get", KEYS[1]) ~= ARGV[1] then return 0 end
     redis.call("hset", KEYS[2], unpack(ARGV, 3))
     redis.call("expire", KEYS[2], ARGV[2])
     return 1`,
    {
      keys: [pool.lock.lockKey, pool.key],
      arguments: [
        pool.lock.lockValue,
        String(STATE_TTL_SECONDS),
        ...Object.entries(fields).flat(),
      ],
    }
  );
  return saved === 1
    ? new Ok(undefined)
    : new Err(new Error("Transfer pool lock expired"));
}

async function getJob(
  pool: TransferPool,
  jobName: string
): Promise<Result<google.storagetransfer.v1.ITransferJob | null, Error>> {
  try {
    const [job] = await pool.client.getTransferJob(
      { jobName, projectId: pool.config.transferProjectId },
      RPC_OPTIONS
    );
    return new Ok(job);
  } catch (error) {
    // gRPC NOT_FOUND means this pool slot has not been created yet.
    if (error instanceof Error && "code" in error && error.code === 5) {
      return new Ok(null);
    }
    return new Err(normalizeError(error));
  }
}

async function findAvailableJob(
  pool: TransferPool,
  cursor: number
): Promise<Result<AvailableJob | null, Error>> {
  for (let offset = 0; offset < POOL_SIZE; offset++) {
    const deadline = checkDeadline(pool);
    if (deadline.isErr()) {
      return deadline;
    }
    const slot = (cursor + offset) % POOL_SIZE;
    const jobName = `transferJobs/dust-relocation-${pool.id}-${slot}`;
    const job = await getJob(pool, jobName);
    if (job.isErr()) {
      return job;
    }
    const previousOperationName = job.value?.latestOperationName ?? null;
    const recordedOperation = await pool.redis.hGet(pool.key, jobName);
    // STS may not show the operation returned by runTransferJob immediately.
    if (recordedOperation && recordedOperation !== previousOperationName) {
      continue;
    }
    if (previousOperationName) {
      const [operation] = await pool.client.getOperation(
        new protos.google.longrunning.GetOperationRequest({
          name: previousOperationName,
        }),
        RPC_OPTIONS
      );
      if (!operation.done) {
        continue;
      }
    }
    return new Ok({
      jobName,
      previousOperationName,
      nextSlot: (slot + 1) % POOL_SIZE,
    });
  }
  return new Ok(null);
}

async function configureJob(
  pool: TransferPool,
  pending: PendingTransfer,
  existingJob: google.storagetransfer.v1.ITransferJob | null
): Promise<Result<void, Error>> {
  const deadline = checkDeadline(pool);
  if (deadline.isErr()) {
    return deadline;
  }
  const transferSpec: google.storagetransfer.v1.ITransferSpec = {
    gcsDataSource: {
      bucketName: pending.sourceBucket,
      path: pending.sourcePath,
    },
    gcsDataSink: { bucketName: pending.destBucket, path: pending.destPath },
    transferOptions: { overwriteWhen: "DIFFERENT" },
  };
  if (existingJob) {
    await pool.client.updateTransferJob(
      {
        jobName: pending.jobName,
        projectId: pool.config.transferProjectId,
        transferJob: { transferSpec },
        updateTransferJobFieldMask: { paths: ["transfer_spec"] },
      },
      RPC_OPTIONS
    );
  } else {
    const transferJob: google.storagetransfer.v1.ITransferJob = {
      name: pending.jobName,
      projectId: pool.config.transferProjectId,
      description: `Relocate workspace ${pool.config.workspaceId} from ${pool.config.sourceCell} to ${pool.config.destCell}`,
      transferSpec,
      status: "ENABLED",
    };
    // No schedule means only explicit runTransferJob calls can start this job.
    await pool.client.createTransferJob({ transferJob }, RPC_OPTIONS);
  }
  return new Ok(undefined);
}

async function findPendingOperation(
  pool: TransferPool,
  pending: PendingTransfer,
  latestOperationName: string | null | undefined
): Promise<Result<string | null, Error>> {
  let operationName = latestOperationName;
  if (!operationName || operationName === pending.previousOperationName) {
    // The operation list can expose a run before latestOperationName catches up.
    const operations = pool.client.listOperationsAsync(
      new protos.google.longrunning.ListOperationsRequest({
        name: TRANSFER_OPERATIONS_COLLECTION,
        filter: JSON.stringify({
          projectId: pool.config.transferProjectId,
          jobNames: [pending.jobName],
        }),
        pageSize: 1,
      }),
      RPC_OPTIONS
    );
    for await (const operation of operations) {
      // The SDK types pages here but yields individual operations, newest first.
      const parsed = OperationNameSchema.safeParse(operation);
      if (!parsed.success) {
        return new Err(new Error("Invalid transfer operation from STS"));
      }
      operationName = parsed.data.name;
      break;
    }
  }
  if (!operationName || operationName === pending.previousOperationName) {
    return new Ok(null);
  }
  const [operation] = await pool.client.getOperation(
    new protos.google.longrunning.GetOperationRequest({ name: operationName }),
    RPC_OPTIONS
  );
  const value = operation.metadata?.value;
  if (!value) {
    return new Err(new Error("Missing transfer operation metadata"));
  }
  const { transferJobName, transferSpec } =
    protos.google.storagetransfer.v1.TransferOperation.decode(
      typeof value === "string" ? Buffer.from(value, "base64") : value
    );
  if (
    transferJobName !== pending.jobName ||
    transferSpec?.gcsDataSource?.bucketName !== pending.sourceBucket ||
    transferSpec?.gcsDataSource?.path !== pending.sourcePath ||
    transferSpec?.gcsDataSink?.bucketName !== pending.destBucket ||
    transferSpec?.gcsDataSink?.path !== pending.destPath
  ) {
    return new Err(
      new Error("Transfer operation does not match pending prefix")
    );
  }
  return new Ok(operationName);
}

async function startPendingTransfer(
  pool: TransferPool,
  pending: PendingTransfer
): Promise<Result<string, Error>> {
  const job = await getJob(pool, pending.jobName);
  if (job.isErr()) {
    return job;
  }
  let operationName: string | null = null;
  if (pending.configured) {
    const recovered = await findPendingOperation(
      pool,
      pending,
      job.value?.latestOperationName
    );
    if (recovered.isErr()) {
      return recovered;
    }
    operationName = recovered.value;
  } else {
    const configured = await configureJob(pool, pending, job.value);
    if (configured.isErr()) {
      return configured;
    }
    // Persist before RUN so retries never patch a possibly active job.
    const saved = await savePoolState(pool, {
      pending: JSON.stringify({ ...pending, configured: true }),
    });
    if (saved.isErr()) {
      return saved;
    }
  }
  if (!operationName) {
    // RUN may never have reached STS, which rejects overlapping runs.
    const deadline = checkDeadline(pool);
    if (deadline.isErr()) {
      return deadline;
    }
    const [operation] = await pool.client.runTransferJob(
      {
        jobName: pending.jobName,
        projectId: pool.config.transferProjectId,
      },
      RPC_OPTIONS
    );
    operationName = operation.name ?? null;
  }
  if (!operationName) {
    return new Err(new Error("STS did not return a transfer operation"));
  }
  const saved = await savePoolState(pool, {
    [pending.requestId]: operationName,
    [pending.jobName]: operationName,
    pending: "",
  });
  return saved.isErr() ? saved : new Ok(operationName);
}

async function startTransferFromPool(
  pool: TransferPool,
  requestId: string
): Promise<Result<string, Error>> {
  const [cachedOperation, pendingJson, cursor, retryAfterMs] =
    await pool.redis.hmGet(pool.key, [
      requestId,
      "pending",
      "cursor",
      "retryAfterMs",
    ]);
  if (cachedOperation) {
    return new Ok(cachedOperation);
  }
  if (pendingJson) {
    const parsed = PendingTransferSchema.safeParse(JSON.parse(pendingJson));
    if (!parsed.success) {
      return new Err(new Error("Invalid pending transfer in Redis"));
    }
    const recovered = await startPendingTransfer(pool, parsed.data);
    if (recovered.isErr() || parsed.data.requestId === requestId) {
      return recovered;
    }
  }
  if (Number(retryAfterMs) > Date.now()) {
    return new Err(new Error("All transfer pool jobs are busy"));
  }
  const available = await findAvailableJob(pool, Number(cursor ?? 0));
  if (available.isErr()) {
    return available;
  }
  if (!available.value) {
    const saved = await savePoolState(pool, {
      retryAfterMs: String(Date.now() + BUSY_RETRY_DELAY_MS),
    });
    return saved.isErr()
      ? saved
      : new Err(new Error("All transfer pool jobs are busy"));
  }
  const { jobName, previousOperationName, nextSlot } = available.value;
  const pending: PendingTransfer = {
    requestId,
    jobName,
    previousOperationName,
    sourceBucket: pool.config.sourceBucket,
    sourcePath: pool.config.sourcePath,
    destBucket: pool.config.destBucket,
    destPath: pool.config.destPath,
    configured: false,
  };
  const saved = await savePoolState(pool, {
    pending: JSON.stringify(pending),
    cursor: String(nextSlot),
  });
  return saved.isErr() ? saved : startPendingTransfer(pool, pending);
}

/**
 * @cc [owner:flvndvd,label:concurrency] pooled-transfer-assignment
 * A pool MUST have at most 20 jobs and MUST NOT reconfigure an active transfer.
 * An interrupted start MUST be reconciled before assigning another prefix.
 */
export async function startPooledTransfer(
  client: StorageTransferServiceClient,
  config: PooledTransferConfig
): Promise<Result<string, Error>> {
  const id = hash([
    config.workspaceId,
    config.transferProjectId,
    config.sourceCell,
    config.destCell,
    config.sourceBucket,
    config.destBucket,
  ]);
  const key = `relocation:table-transfers:${id}`;
  const requestId = hash([config.sourcePath, config.destPath]);
  const redis = await getRedisStreamClient({ origin: "lock" });
  // A delayed lock reply must not give an expired owner a fresh deadline.
  const deadlineMs = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS + START_TIMEOUT_MS;
  return executeWithLockResult(
    key,
    async (lock) => {
      try {
        return await startTransferFromPool(
          {
            client,
            redis,
            config,
            key,
            id,
            deadlineMs,
            lock,
          },
          requestId
        );
      } catch (error) {
        return new Err(normalizeError(error));
      }
    },
    LOCK_ACQUIRE_TIMEOUT_MS,
    { lockTtlMs: LOCK_TTL_MS }
  );
}
