import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import { ensureConversationSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { rootCommand } from "@app/lib/api/sandbox/root_command";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import { z } from "zod";

const KIB = 1024;
const MIB = 1024 * KIB;
// Keep the live matrix comfortably below the E2B command lifetime. The largest
// size is still large enough to make transfer cost dominate syscall overhead.
const BENCHMARK_SIZES = [4 * KIB, MIB, 8 * MIB] as const;
const METADATA_ITERATIONS = 50;
const DIRECTORY_ITERATIONS = 15;
const DIRECTORY_ENTRY_COUNT = 20;
const WRITE_SAMPLES = 2;
const MUTATION_SAMPLES = 3;
const BENCHMARK_TIMEOUT_MS = 15 * 60 * 1000;

const SummarySchema = z.object({
  samples: z.number().int().positive(),
  minMs: z.number().nonnegative(),
  meanMs: z.number().nonnegative(),
  p50Ms: z.number().nonnegative(),
  p95Ms: z.number().nonnegative(),
  maxMs: z.number().nonnegative(),
  medianMiBs: z.number().nonnegative().optional(),
});

const BenchmarkResultSchema = z.object({
  environment: z.object({
    runtime: z.string(),
    platform: z.string(),
    architecture: z.string(),
    directRoot: z.string(),
    overlayRoot: z.string(),
  }),
  coldReads: z.array(
    z.object({
      sizeBytes: z.number().int().positive(),
      order: z.array(z.enum(["direct", "overlay"])),
      directMs: z.number().nonnegative(),
      overlayMs: z.number().nonnegative(),
    })
  ),
  warmReads: z.array(
    z.object({
      sizeBytes: z.number().int().positive(),
      direct: SummarySchema,
      overlay: SummarySchema,
    })
  ),
  concurrentReads: z.array(
    z.object({
      concurrency: z.number().int().positive(),
      sizeBytes: z.number().int().positive(),
      direct: SummarySchema,
      overlay: SummarySchema,
    })
  ),
  metadata: z.object({
    stat: z.object({
      iterations: z.number().int().positive(),
      direct: SummarySchema,
      overlay: SummarySchema,
    }),
    readdir: z.object({
      iterations: z.number().int().positive(),
      entries: z.number().int().positive(),
      direct: SummarySchema,
      overlay: SummarySchema,
    }),
  }),
  writes: z.array(
    z.object({
      sizeBytes: z.number().int().positive(),
      direct: z.object({
        open: SummarySchema,
        write: SummarySchema,
        fsync: SummarySchema,
        close: SummarySchema,
        total: SummarySchema,
      }),
      overlay: z.object({
        open: SummarySchema,
        write: SummarySchema,
        fsync: SummarySchema,
        close: SummarySchema,
        total: SummarySchema,
      }),
    })
  ),
  mutations: z.object({
    samples: z.number().int().positive(),
    rename: z.object({ direct: SummarySchema, overlay: SummarySchema }),
    unlink: z.object({ direct: SummarySchema, overlay: SummarySchema }),
  }),
});

type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>;

const BENCHMARK_PROGRAM = String.raw`
const fs = require("node:fs");

const config = JSON.parse(process.argv[1]);
const {
  phase,
  benchmarkDirectory,
  directRoot,
  overlayRoot,
  sizes,
  metadataIterations,
  directoryIterations,
  directoryEntryCount,
  writeSamples,
  mutationSamples,
} = config;

const MIB = 1024 * 1024;
const now = () => process.hrtime.bigint();
const elapsedMs = (start) => Number(process.hrtime.bigint() - start) / 1e6;
const filePath = (root, name) => root + "/" + benchmarkDirectory + "/" + name;

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function summarize(samples, bytes) {
  const sorted = [...samples].sort((left, right) => left - right);
  const meanMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const summary = {
    samples: samples.length,
    minMs: sorted[0],
    meanMs,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1],
  };
  if (bytes !== undefined) {
    summary.medianMiBs = bytes / MIB / (summary.p50Ms / 1000);
  }
  return summary;
}

function readOnce(path, expectedSize) {
  const startedAt = now();
  const handle = fs.openSync(path, "r");
  const buffer = Buffer.allocUnsafe(Math.min(MIB, expectedSize));
  let bytesRead = 0;
  while (bytesRead < expectedSize) {
    const read = fs.readSync(
      handle,
      buffer,
      0,
      Math.min(buffer.length, expectedSize - bytesRead),
      bytesRead
    );
    if (read === 0) {
      break;
    }
    bytesRead += read;
  }
  fs.closeSync(handle);
  if (bytesRead !== expectedSize) {
    throw new Error("short read for " + path + ": " + bytesRead + "/" + expectedSize);
  }
  return elapsedMs(startedAt);
}

function warmReadSamples(path, size) {
  readOnce(path, size);
  const iterations = size <= 4096 ? 20 : size <= MIB ? 10 : 3;
  return Array.from({ length: iterations }, () => readOnce(path, size));
}

async function concurrentReadBatch(path, size, concurrency) {
  const startedAt = now();
  const buffers = await Promise.all(
    Array.from({ length: concurrency }, () => fs.promises.readFile(path))
  );
  if (buffers.some((buffer) => buffer.length !== size)) {
    throw new Error("short concurrent read for " + path);
  }
  return elapsedMs(startedAt);
}

function batchedOperation(iterations, batchSize, operation) {
  const samples = [];
  for (let completed = 0; completed < iterations; completed += batchSize) {
    const count = Math.min(batchSize, iterations - completed);
    const startedAt = now();
    for (let index = 0; index < count; index += 1) {
      operation();
    }
    samples.push(elapsedMs(startedAt) / count);
  }
  return samples;
}

function writeOnce(path, size) {
  const chunk = Buffer.alloc(Math.min(MIB, size));
  const totalStartedAt = now();
  const openStartedAt = now();
  const handle = fs.openSync(path, "w");
  const openMs = elapsedMs(openStartedAt);
  const writeStartedAt = now();
  let written = 0;
  while (written < size) {
    written += fs.writeSync(
      handle,
      chunk,
      0,
      Math.min(chunk.length, size - written),
      written
    );
  }
  const writeMs = elapsedMs(writeStartedAt);
  const fsyncStartedAt = now();
  fs.fsyncSync(handle);
  const fsyncMs = elapsedMs(fsyncStartedAt);
  const closeStartedAt = now();
  fs.closeSync(handle);
  const closeMs = elapsedMs(closeStartedAt);
  return { openMs, writeMs, fsyncMs, closeMs, totalMs: elapsedMs(totalStartedAt) };
}

function summarizeWrites(samples, size) {
  return {
    open: summarize(samples.map((sample) => sample.openMs)),
    write: summarize(samples.map((sample) => sample.writeMs), size),
    fsync: summarize(samples.map((sample) => sample.fsyncMs)),
    close: summarize(samples.map((sample) => sample.closeMs)),
    total: summarize(samples.map((sample) => sample.totalMs), size),
  };
}

function seedMutationFile(name) {
  const path = filePath(directRoot, name);
  const handle = fs.openSync(path, "w");
  fs.writeSync(handle, Buffer.alloc(4096));
  fs.fsyncSync(handle);
  fs.closeSync(handle);
}

async function main() {
  fs.statSync(directRoot);
  fs.statSync(overlayRoot);

  const environment = {
    runtime: "bun " + Bun.version,
    platform: process.platform,
    architecture: process.arch,
    directRoot,
    overlayRoot,
  };

  if (phase === "reads") {
  const coldReads = [];
  const warmReads = [];
  for (let index = 0; index < sizes.length; index += 1) {
    const size = sizes[index];
    const paths = {
      direct: filePath(directRoot, "read-direct-" + size + ".bin"),
      overlay: filePath(overlayRoot, "read-overlay-" + size + ".bin"),
    };
    const order = index % 2 === 0 ? ["direct", "overlay"] : ["overlay", "direct"];
    const cold = {};
    for (const route of order) {
      cold[route] = readOnce(paths[route], size);
    }
    coldReads.push({
      sizeBytes: size,
      order,
      directMs: cold.direct,
      overlayMs: cold.overlay,
    });
    warmReads.push({
      sizeBytes: size,
      direct: summarize(warmReadSamples(paths.direct, size), size),
      overlay: summarize(warmReadSamples(paths.overlay, size), size),
    });
  }

  const concurrentReads = [];
  const concurrencySize = MIB;
  for (const concurrency of [1, 4, 8]) {
    const directSamples = [];
    const overlaySamples = [];
    for (let sample = 0; sample < 3; sample += 1) {
      directSamples.push(
        await concurrentReadBatch(
          filePath(directRoot, "read-direct-" + concurrencySize + ".bin"),
          concurrencySize,
          concurrency
        )
      );
      overlaySamples.push(
        await concurrentReadBatch(
          filePath(overlayRoot, "read-overlay-" + concurrencySize + ".bin"),
          concurrencySize,
          concurrency
        )
      );
    }
    concurrentReads.push({
      concurrency,
      sizeBytes: concurrencySize,
      direct: summarize(directSamples, concurrencySize * concurrency),
      overlay: summarize(overlaySamples, concurrencySize * concurrency),
    });
  }

  return { environment, coldReads, warmReads, concurrentReads };
  }

  if (phase === "metadata") {
  const metadataPath = {
    direct: filePath(directRoot, "read-direct-4096.bin"),
    overlay: filePath(overlayRoot, "read-overlay-4096.bin"),
  };
  const directoryPath = {
    direct: filePath(directRoot, "directory"),
    overlay: filePath(overlayRoot, "directory"),
  };
  const metadata = {
    stat: {
      iterations: metadataIterations,
      direct: summarize(
        batchedOperation(metadataIterations, 10, () => fs.statSync(metadataPath.direct))
      ),
      overlay: summarize(
        batchedOperation(metadataIterations, 10, () => fs.statSync(metadataPath.overlay))
      ),
    },
    readdir: {
      iterations: directoryIterations,
      entries: directoryEntryCount,
      direct: summarize(
        batchedOperation(directoryIterations, 5, () => fs.readdirSync(directoryPath.direct))
      ),
      overlay: summarize(
        batchedOperation(directoryIterations, 5, () => fs.readdirSync(directoryPath.overlay))
      ),
    },
  };

  return { metadata };
  }

  if (phase === "writes") {
  const writes = [];
  for (const size of sizes) {
    const directSamples = [];
    const overlaySamples = [];
    for (let sample = 0; sample < writeSamples; sample += 1) {
      const routes = sample % 2 === 0 ? ["direct", "overlay"] : ["overlay", "direct"];
      for (const route of routes) {
        const result = writeOnce(
          filePath(
            route === "direct" ? directRoot : overlayRoot,
            "write-" + route + "-" + size + "-" + sample + ".bin"
          ),
          size
        );
        (route === "direct" ? directSamples : overlaySamples).push(result);
      }
    }
    writes.push({
      sizeBytes: size,
      direct: summarizeWrites(directSamples, size),
      overlay: summarizeWrites(overlaySamples, size),
    });
  }

  return { writes };
  }

  if (phase === "mutations") {
  const directRenameSamples = [];
  const directUnlinkSamples = [];
  const overlayRenameSamples = [];
  const overlayUnlinkSamples = [];
  for (let sample = 0; sample < mutationSamples; sample += 1) {
    const directSourceName = "mutation-direct-source-" + sample + ".bin";
    const directDestinationName = "mutation-direct-destination-" + sample + ".bin";
    seedMutationFile(directSourceName);
    let startedAt = now();
    fs.renameSync(
      filePath(directRoot, directSourceName),
      filePath(directRoot, directDestinationName)
    );
    directRenameSamples.push(elapsedMs(startedAt));
    startedAt = now();
    fs.unlinkSync(filePath(directRoot, directDestinationName));
    directUnlinkSamples.push(elapsedMs(startedAt));

    const overlaySourceName = "mutation-overlay-source-" + sample + ".bin";
    const overlayDestinationName = "mutation-overlay-destination-" + sample + ".bin";
    seedMutationFile(overlaySourceName);
    fs.statSync(filePath(overlayRoot, overlaySourceName));
    startedAt = now();
    fs.renameSync(
      filePath(overlayRoot, overlaySourceName),
      filePath(overlayRoot, overlayDestinationName)
    );
    overlayRenameSamples.push(elapsedMs(startedAt));
    startedAt = now();
    fs.unlinkSync(filePath(overlayRoot, overlayDestinationName));
    overlayUnlinkSamples.push(elapsedMs(startedAt));
  }

  return {
    mutations: {
      samples: mutationSamples,
      rename: {
        direct: summarize(directRenameSamples),
        overlay: summarize(overlayRenameSamples),
      },
      unlink: {
        direct: summarize(directUnlinkSamples),
        overlay: summarize(overlayUnlinkSamples),
      },
    },
  };
  }

  throw new Error("Unknown benchmark phase: " + phase);
}

main()
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((error) => {
    process.stderr.write(error.stack || String(error));
    process.exit(1);
  });
`;

async function uploadFixtures({
  benchmarkGcsPrefix,
}: {
  benchmarkGcsPrefix: string;
}): Promise<void> {
  const bucket = getPrivateUploadBucket();
  for (const size of BENCHMARK_SIZES) {
    const buffer = Buffer.alloc(size);
    await Promise.all(
      (["direct", "overlay"] as const).map((route) =>
        bucket.file(`${benchmarkGcsPrefix}read-${route}-${size}.bin`).save(buffer, {
          contentType: "application/octet-stream",
          resumable: size >= 8 * MIB,
        })
      )
    );
  }
  await Promise.all(
    Array.from({ length: DIRECTORY_ENTRY_COUNT }, (_, index) =>
      bucket
        .file(`${benchmarkGcsPrefix}directory/entry-${index}.txt`)
        .save(Buffer.from(String(index)), {
          contentType: "text/plain",
          resumable: false,
        })
    )
  );
}

function ratio(overlay: number, direct: number): number {
  return direct === 0 ? 0 : overlay / direct;
}

function summarizeResult(result: BenchmarkResult) {
  return {
    coldReadRatios: result.coldReads.map((entry) => ({
      sizeBytes: entry.sizeBytes,
      ratio: ratio(entry.overlayMs, entry.directMs),
    })),
    warmReadRatios: result.warmReads.map((entry) => ({
      sizeBytes: entry.sizeBytes,
      ratio: ratio(entry.overlay.p50Ms, entry.direct.p50Ms),
    })),
    concurrentReadRatios: result.concurrentReads.map((entry) => ({
      concurrency: entry.concurrency,
      ratio: ratio(entry.overlay.p50Ms, entry.direct.p50Ms),
    })),
    statRatio: ratio(
      result.metadata.stat.overlay.p50Ms,
      result.metadata.stat.direct.p50Ms
    ),
    readdirRatio: ratio(
      result.metadata.readdir.overlay.p50Ms,
      result.metadata.readdir.direct.p50Ms
    ),
    committedWriteRatios: result.writes.map((entry) => ({
      sizeBytes: entry.sizeBytes,
      ratio: ratio(entry.overlay.total.p50Ms, entry.direct.total.p50Ms),
    })),
    renameRatio: ratio(
      result.mutations.rename.overlay.p50Ms,
      result.mutations.rename.direct.p50Ms
    ),
    unlinkRatio: ratio(
      result.mutations.unlink.overlay.p50Ms,
      result.mutations.unlink.direct.p50Ms
    ),
  };
}

makeScript(
  {
    wId: { type: "string", demandOption: true },
    userEmail: { type: "string", demandOption: true },
    podId: { type: "string", demandOption: true },
    benchmarkPhase: { type: "string" },
  },
  async ({ wId, userEmail, podId, benchmarkPhase, execute }, logger) => {
    if (!execute) {
      logger.info("Dry run — pass --execute to run the disposable benchmark.");
      return;
    }

    const user = await UserResource.fetchByEmail(userEmail);
    if (!user) {
      throw new Error(`User not found: ${userEmail}`);
    }
    const auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, wId);
    const workspace = auth.getNonNullableWorkspace();
    const pod = await SpaceResource.fetchById(auth, podId);
    if (!pod?.isProject() || !pod.canWrite(auth)) {
      throw new Error(`Writable pod not found: ${podId}`);
    }

    let conversation: ConversationResource | null = null;
    let benchmarkGcsPrefix: string | null = null;
    try {
      conversation = await ConversationResource.makeNew(
        auth,
        {
          sId: generateRandomModelSId(),
          title: "Sandbox filesystem overlay benchmark",
          visibility: "unlisted",
          depth: 0,
          requestedSpaceIds: [pod.id],
          spaceId: pod.id,
        },
        pod
      );
      const benchmarkDirectory = `.dust-fs-benchmark-${generateRandomModelSId()}`;
      benchmarkGcsPrefix = `${getConversationFilesBasePath({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
      })}${benchmarkDirectory}/`;
      await uploadFixtures({ benchmarkGcsPrefix });

      const readyResult = await ensureConversationSandboxReady(
        auth,
        conversation.toJSON()
      );
      if (readyResult.isErr()) {
        throw readyResult.error;
      }
      const { sandbox } = readyResult.value;
      const directRoot = "/run/dust-fs/data/mount-0";
      const overlayRoot = `/files/conversation-${conversation.sId}`;
      const rawResult: Record<string, unknown> = {};
      const phases = [
        { name: "reads", programPhase: "reads", sizes: BENCHMARK_SIZES },
        { name: "metadata", programPhase: "metadata", sizes: BENCHMARK_SIZES },
        ...BENCHMARK_SIZES.map((size) => ({
          name: `write-${size}`,
          programPhase: "writes",
          sizes: [size],
        })),
        { name: "mutations", programPhase: "mutations", sizes: BENCHMARK_SIZES },
      ];
      const selectedPhases = benchmarkPhase
        ? phases.filter((phase) => phase.name === benchmarkPhase)
        : phases;
      if (selectedPhases.length === 0) {
        throw new Error(
          `Unknown benchmark phase ${benchmarkPhase}. Expected one of: ${phases.map((phase) => phase.name).join(", ")}`
        );
      }

      for (const phase of selectedPhases) {
        const benchmarkCommand = rootCommand.exec("/opt/bin/bun", [
          "-e",
          BENCHMARK_PROGRAM,
          JSON.stringify({
            phase: phase.programPhase,
            benchmarkDirectory,
            directRoot,
            overlayRoot,
            sizes: phase.sizes,
            metadataIterations: METADATA_ITERATIONS,
            directoryIterations: DIRECTORY_ITERATIONS,
            directoryEntryCount: DIRECTORY_ENTRY_COUNT,
            writeSamples: WRITE_SAMPLES,
            mutationSamples: MUTATION_SAMPLES,
          }),
        ]);
        const benchmarkResult = await sandbox.execRoot(auth, benchmarkCommand, {
          timeoutMs: BENCHMARK_TIMEOUT_MS,
        });
        if (benchmarkResult.isErr()) {
          throw benchmarkResult.error;
        }
        if (benchmarkResult.value.exitCode !== 0) {
          throw new Error(
            `Sandbox benchmark phase ${phase.name} failed (${benchmarkResult.value.exitCode}): ${benchmarkResult.value.stderr || benchmarkResult.value.stdout}`
          );
        }

        const phaseResult = z
          .record(z.string(), z.unknown())
          .parse(JSON.parse(benchmarkResult.value.stdout));
        if (phaseResult.writes) {
          rawResult.writes = [
            ...z.array(z.unknown()).parse(rawResult.writes ?? []),
            ...z.array(z.unknown()).parse(phaseResult.writes),
          ];
          delete phaseResult.writes;
        }
        Object.assign(rawResult, phaseResult);
        logger.info(
          { phase: phase.name, sandboxId: sandbox.sId },
          "Sandbox filesystem benchmark phase completed"
        );
      }

      if (benchmarkPhase) {
        logger.info(
          {
            conversationId: conversation.sId,
            podId: pod.sId,
            sandboxId: sandbox.sId,
            phase: benchmarkPhase,
            result: rawResult,
          },
          "Sandbox filesystem benchmark selected phase completed"
        );
        return;
      }

      const result = BenchmarkResultSchema.parse(rawResult);
      logger.info(
        {
          conversationId: conversation.sId,
          podId: pod.sId,
          sandboxId: sandbox.sId,
          configuration: {
            sizes: BENCHMARK_SIZES,
            metadataIterations: METADATA_ITERATIONS,
            directoryIterations: DIRECTORY_ITERATIONS,
            directoryEntryCount: DIRECTORY_ENTRY_COUNT,
            writeSamples: WRITE_SAMPLES,
            mutationSamples: MUTATION_SAMPLES,
          },
          summary: summarizeResult(result),
          result,
        },
        "Sandbox filesystem overlay benchmark completed"
      );
    } finally {
      if (benchmarkGcsPrefix) {
        await getPrivateUploadBucket()
          .deleteByPrefix(benchmarkGcsPrefix)
          .catch((error) => {
            logger.error(
              { err: error, benchmarkGcsPrefix },
              "Benchmark GCS cleanup failed"
            );
          });
      }
      if (conversation) {
        const destroyResult = await destroyConversation(auth, { conversation });
        if (destroyResult.isErr()) {
          logger.error(
            { err: destroyResult.error, conversationId: conversation.sId },
            "Benchmark conversation cleanup failed"
          );
        } else {
          logger.info(
            { conversationId: conversation.sId, podId: pod.sId },
            "Sandbox filesystem benchmark resources cleaned up"
          );
        }
      }
    }
  }
);
