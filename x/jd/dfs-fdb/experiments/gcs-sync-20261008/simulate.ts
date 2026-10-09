import { createDfsProjection } from "@app/workers/gcs_dfs/projection";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";
import { z } from "zod";

import logger from "@app/logger/logger";
import type { SourceStorage } from "@app/workers/gcs_dfs/processor";
import { ConfigSchema } from "@app/workers/gcs_dfs/protocol";
import type { Metadata, Source } from "@app/workers/gcs_dfs/protocol";
import { GoogleTransport } from "@app/workers/gcs_dfs/transport";
import { runWorker } from "@app/workers/gcs_dfs/worker";

const { values } = parseArgs({
  options: {
    mode: { type: "string" },
    config: { type: "string" },
    directory: { type: "string" },
    documents: { type: "string", default: "100000" },
    workers: { type: "string", default: "1" },
    "worker-id": { type: "string", default: "0" },
  },
});
const mode = z.enum(["worker", "publish"]).parse(values.mode);
const directory = z.string().min(1).parse(values.directory);
const config = ConfigSchema.parse(
  JSON.parse(readFileSync(z.string().parse(values.config), "utf8"))
);
const documents = z.coerce
  .number()
  .int()
  .min(1)
  .max(1_000_000)
  .parse(values.documents);
if (!config.pubsubEmulatorHost) {
  throw new Error("Simulation requires an explicit loopback emulator");
}
const base = `http://${config.pubsubEmulatorHost}/v1`;
const topic = config.subscription.replace("/subscriptions/", "/topics/");
const bucket = config.bindings[0].bucket;
const workers = z.coerce.number().int().min(1).max(4).parse(values.workers);
const workerId = z.coerce
  .number()
  .int()
  .min(0)
  .max(workers - 1)
  .parse(values["worker-id"]);
const progressPath = `${directory}/progress-${workerId}.json`;
function progress() {
  return Array.from({ length: workers }, (_, index) => {
    const path = `${directory}/progress-${index}.json`;
    if (!existsSync(path)) {
      return { acknowledged: 0, applied: 0 };
    }
    return z
      .object({ acknowledged: z.number(), applied: z.number() })
      .parse(JSON.parse(readFileSync(path, "utf8")));
  }).reduce(
    (total, next) => ({
      acknowledged: total.acknowledged + next.acknowledged,
      applied: total.applied + next.applied,
    }),
    { acknowledged: 0, applied: 0 }
  );
}
const phasePath = `${directory}/phase.json`;
const startedMs = Date.now();

function save(path: string, value: unknown) {
  writeFileSync(`${path}.partial`, JSON.stringify(value));
  renameSync(`${path}.partial`, path);
}
function content(index: number, generation: string) {
  return Buffer.from(`doc:${index};generation:${generation}\n`);
}
function metadata(index: number, phase: number): Metadata {
  const generation = [
    "9007199254741000",
    "100",
    "9007199254740995",
    "42",
    "9007199254740993",
  ][Math.floor(phase / 2)];
  return {
    bucket,
    name: `w/tenant-${index % 64}/doc-${index}`,
    generation,
    metageneration: phase % 2 === 0 ? "1" : "2",
    size: String(content(index, generation).length),
    updated: "2026-10-08T00:00:00.000Z",
    metadata: { untrusted_readers: "everyone" },
    contentType: "text/plain",
  };
}
const phaseSchema = z.object({ phase: z.number().int().min(0).max(9) });
class SimulatedSource implements SourceStorage {
  async metadata(source: Source, generation?: string) {
    const index = Number(source.name.match(/doc-([0-9]+)$/)?.[1]);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= documents ||
      source.bucket !== bucket
    ) {
      return null;
    }
    const { phase } = phaseSchema.parse(
      JSON.parse(readFileSync(phasePath, "utf8"))
    );
    if (phase === 9 && index % 4 === 0) {
      return null;
    }
    const current = metadata(index, phase);
    return !generation || generation === current.generation ? current : null;
  }
  async *content(value: Metadata) {
    const index = Number(value.name.match(/doc-([0-9]+)$/)?.[1]);
    yield content(index, value.generation);
  }
}
async function request(path: string, method: string, body: unknown) {
  const response = await fetch(`${base}/${path}`, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Emulator request failed: ${response.status}`);
  }
  return response.json();
}
function event(
  index: number,
  phase: number,
  eventType: string,
  generationOverride?: string
) {
  const value = {
    ...metadata(index, phase),
    ...(generationOverride ? { generation: generationOverride } : {}),
  };
  return {
    data: Buffer.from(JSON.stringify(value)).toString("base64"),
    attributes: {
      eventType,
      payloadFormat: "JSON_API_V1",
      bucketId: bucket,
      objectId: value.name,
      objectGeneration: value.generation,
      eventTime: value.updated,
      notificationConfig: "simulation",
    },
  };
}

async function main() {
  if (mode === "worker") {
    const google = new GoogleTransport(config);
    const dfs = await createDfsProjection(config);
    const stats = {
      acknowledged: 0,
      applied: 0,
      stale: 0,
      stagedBytes: 0,
      maxRssBytes: 0,
      startedMs,
      updatedMs: startedMs,
    };
    let stopping = false;
    const flush = () => {
      stats.updatedMs = Date.now();
      stats.maxRssBytes = Math.max(
        stats.maxRssBytes,
        process.memoryUsage().rss
      );
      save(progressPath, stats);
    };
    process.once("SIGTERM", () => {
      stopping = true;
    });
    process.once("SIGINT", () => {
      stopping = true;
    });
    flush();
    const progressTimer = setInterval(flush, 1000);
    try {
      await runWorker(
        config,
        {
          pull: () => google.pull(),
          lease: (ids, seconds) => google.lease(ids, seconds),
          acknowledge: async (ids) => {
            await google.acknowledge(ids);
            stats.acknowledged += ids.length;
            if (stats.acknowledged % 100 === 0) {
              flush();
            }
          },
        },
        new SimulatedSource(),
        {
          cursor: (binding, source) => dfs.cursor(binding, source),
          withSource: (binding, source, run) => dfs.withSource(binding, source, (session) => run({
            cursor: (binding, source) => session.cursor(binding, source),
            stage: async (binding, hash, bytes) => {
              await session.stage(binding, hash, bytes);
              stats.stagedBytes += bytes.length;
            },
            publish: async (binding, publication) => {
              const result = await session.publish(binding, publication);
              stats[result]++;
              return result;
            },
          })),
        },
        () => stopping
      );
    } finally {
      dfs.close();
      clearInterval(progressTimer);
      flush();
    }
    return;
  }
  await request(topic, "PUT", {});
  await request(config.subscription, "PUT", { topic, ackDeadlineSeconds: 60 });
  let published = 0;
  let sourceOperations = 0;
  const results = [];
  for (let phase = 0; phase < 10; phase++) {
    const phaseStartedMs = Date.now();
    save(phasePath, { phase });
    let next = 0;
    const publish = async () => {
      for (;;) {
        const first = next;
        next += 100;
        if (first >= documents) {
          return;
        }
        const messages = [];
        for (
          let index = first;
          index < Math.min(documents, first + 100);
          index++
        ) {
          const eventType =
            phase === 9 && index % 4 === 0
              ? "OBJECT_DELETE"
              : phase % 2 === 0
                ? "OBJECT_FINALIZE"
                : "OBJECT_METADATA_UPDATE";
          const current = event(index, phase, eventType);
          const changes = [current];
          if (phase > 0 && phase % 2 === 0) {
            changes.push(
              event(
                index,
                phase - 1,
                "OBJECT_ARCHIVE",
                metadata(index, phase - 1).generation
              )
            );
          }
          if (index % 2 === 0) {
            changes.reverse();
          }
          if (index % 100 === 0) {
            changes.push(current);
          }
          messages.push(...changes);
        }
        await request(`${topic}:publish`, "POST", { messages });
        published += messages.length;
      }
    };
    await Promise.all([publish(), publish(), publish(), publish()]);
    sourceOperations += documents;
    const deadlineMs = Date.now() + 30 * 60_000;
    while (Date.now() < deadlineMs) {
      const current = progress();
      if (
        current.acknowledged >= published &&
        current.applied >= sourceOperations
      ) {
        break;
      }
      await delay(1000);
    }
    const current = progress();
    if (
      current.acknowledged < published ||
      current.applied < sourceOperations
    ) {
      throw new Error("Worker drain deadline exceeded");
    }
    const result = {
      phase,
      published,
      sourceOperations,
      durationMs: Date.now() - phaseStartedMs,
    };
    results.push(result);
    save(`${directory}/phases.json`, results);
    logger.info(result, "Simulated source phase drained");
  }
  const generation = metadata(0, 9).generation;
  save(`${directory}/expected.json`, {
    documents,
    bucket,
    generation,
    metageneration: "2",
    deletedModulo: 4,
    bodyTemplate: "doc:{index};generation:{generation}\\n",
  });
  const result = {
    completed: true,
    documents,
    workers,
    concurrencyPerWorker: config.concurrency,
    sourceOperations,
    published,
    durationMs: Date.now() - startedMs,
    corpusHash: createHash("sha256")
      .update(JSON.stringify({ documents, bucket, generation }))
      .digest("hex"),
  };
  save(`${directory}/result.json`, result);
  logger.info(result, "Simulated source run completed");
}

void main().catch((error) => {
  logger.error({ error: String(error) }, "Simulation failed");
  process.exitCode = 1;
});
