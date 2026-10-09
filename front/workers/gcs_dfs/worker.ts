import { setTimeout } from "node:timers/promises";
import { z } from "zod";

import { GcsDfsError } from "@app/workers/gcs_dfs/protocol";

import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { processNotification } from "@app/workers/gcs_dfs/processor";
import type { Projection, SourceStorage } from "@app/workers/gcs_dfs/processor";
import type { Message, WorkerConfig } from "@app/workers/gcs_dfs/protocol";
import { RemoteError } from "@app/workers/gcs_dfs/transport";

export interface Subscription {
  pull(): Promise<Message[]>;
  acknowledge(ackIds: string[]): Promise<void>;
  lease(ackIds: string[], leaseSeconds: number): Promise<void>;
}

export async function processBatch(
  messages: Message[],
  config: WorkerConfig,
  subscription: Subscription,
  storage: SourceStorage,
  projection: Projection
) {
  const pending = new Set(messages.map((message) => message.ackId));
  let leaseFailures = 0;
  let renewing: Promise<void> | null = null;
  const renew = () => {
    if (!renewing) {
      renewing = subscription
        .lease([...pending], config.leaseSeconds)
        .catch(() => {
          leaseFailures++;
        })
        .finally(() => {
          renewing = null;
        });
    }
  };
  renew();
  const timer = globalThis.setInterval(renew, (config.leaseSeconds * 1000) / 3);
  const startedMs = Date.now();
  let results: string[];
  try {
    results = await concurrentExecutor(
      messages,
      async (message) => {
        try {
          const result = await processNotification(
            message,
            config.bindings,
            storage,
            projection
          );
          await subscription.acknowledge([message.ackId]);
          pending.delete(message.ackId);
          return result;
        } catch (error) {
          logger.warn(
            {
              statusCode:
                error instanceof RemoteError ? error.statusCode : undefined,
              failureKind:
                error instanceof GcsDfsError
                  ? error.reason
                  : error instanceof z.ZodError
                    ? "invalid_input"
                    : "transport_or_runtime",
            },
            "GCS DFS message failed; retained for redelivery"
          );
          return "failed";
        }
      },
      { concurrency: config.concurrency }
    );
  } finally {
    globalThis.clearInterval(timer);
    await renewing;
  }
  return {
    received: results.length,
    applied: results.filter((result) => result === "applied").length,
    stale: results.filter((result) => result === "stale").length,
    failed: results.filter((result) => result === "failed").length,
    leaseFailures,
    durationMs: Date.now() - startedMs,
  };
}

export async function runWorker(
  config: WorkerConfig,
  subscription: Subscription,
  storage: SourceStorage,
  projection: Projection,
  stopping: () => boolean
) {
  while (!stopping()) {
    try {
      const messages = await subscription.pull();
      if (messages.length === 0) {
        await setTimeout(1000);
        continue;
      }
      const stats = await processBatch(
        messages,
        config,
        subscription,
        storage,
        projection
      );
      logger.info(stats, "GCS DFS batch completed");
      if (stats.failed > 0) {
        await setTimeout(1000);
      }
    } catch (error) {
      logger.error(
        {
          statusCode:
            error instanceof RemoteError ? error.statusCode : undefined,
        },
        "GCS DFS subscription unavailable"
      );
      await setTimeout(5000);
    }
  }
}
