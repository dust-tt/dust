import { setTimeout } from "node:timers/promises";

import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { processNotification } from "@app/workers/gcs_dfs/processor";
import type { Projection, SourceStorage } from "@app/workers/gcs_dfs/processor";
import { workerOrderingKey } from "@app/workers/gcs_dfs/protocol";
import type {
  Message,
  TransportConfig,
  WorkerConfig,
} from "@app/workers/gcs_dfs/protocol";
import { errorClass, ignoreObservation } from "@app/workers/gcs_dfs/telemetry";
import type { Observer } from "@app/workers/gcs_dfs/telemetry";

export interface Subscription {
  pull(): Promise<Message[]>;
  acknowledge(ackIds: string[]): Promise<void>;
  lease(ackIds: string[], leaseSeconds: number): Promise<void>;
}

export async function processDeliveries(
  messages: Message[],
  config: TransportConfig,
  subscription: Subscription,
  key: (message: Message) => string,
  handle: (message: Message) => Promise<"applied" | "stale" | "published">,
  observe: Observer = ignoreObservation
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
  const results: string[] = [];
  const fail = (error: unknown) => {
    const failureKind = errorClass(error);
    observe({
      operation: "message",
      outcome: "error",
      errorClass: failureKind,
    });
    logger.warn(
      { failureKind },
      "GCS DFS message failed; retained for redelivery"
    );
    results.push("failed");
  };
  try {
    const groups = new Map<string, Message[]>();
    for (const message of messages) {
      observe({ operation: "receive", outcome: "success" });
      try {
        const identity = key(message);
        const group = groups.get(identity) ?? [];
        group.push(message);
        groups.set(identity, group);
      } catch (error) {
        fail(error);
      }
    }
    await concurrentExecutor(
      [...groups.values()],
      async (group) => {
        let failed = false;
        for (const message of group) {
          if (failed) {
            results.push("failed");
            continue;
          }
          const messageStartedMs = Date.now();
          try {
            const result = await handle(message);
            await subscription.acknowledge([message.ackId]);
            pending.delete(message.ackId);
            results.push(result);
            observe({
              operation: "message",
              outcome: result === "published" ? "success" : result,
              durationMs: Date.now() - messageStartedMs,
            });
          } catch (error) {
            failed = true;
            fail(error);
          }
        }
      },
      { concurrency: config.concurrency }
    );
  } finally {
    globalThis.clearInterval(timer);
    await renewing;
  }
  return {
    received: messages.length,
    applied: results.filter((result) => result === "applied").length,
    stale: results.filter((result) => result === "stale").length,
    published: results.filter((result) => result === "published").length,
    failed: results.filter((result) => result === "failed").length,
    leaseFailures,
    durationMs: Date.now() - startedMs,
  };
}

export function processBatch(
  messages: Message[],
  config: WorkerConfig,
  subscription: Subscription,
  storage: SourceStorage,
  projection: Projection,
  observe: Observer = ignoreObservation
) {
  return processDeliveries(
    messages,
    config,
    subscription,
    (message) => workerOrderingKey(message, config),
    (message) =>
      processNotification(
        message,
        config.bindings,
        storage,
        projection,
        observe
      ),
    observe
  );
}

export async function runDeliveryLoop(
  subscription: Subscription,
  batch: (messages: Message[]) => Promise<unknown>,
  stopping: () => boolean
) {
  while (!stopping()) {
    try {
      const messages = await subscription.pull();
      if (stopping()) {
        await subscription.lease(
          messages.map((message) => message.ackId),
          0
        );
        break;
      }
      if (messages.length === 0) {
        await setTimeout(1000);
        continue;
      }
      const stats = await batch(messages);
      logger.info({ stats }, "GCS DFS batch completed");
    } catch (error) {
      logger.error(
        { failureKind: errorClass(error) },
        "GCS DFS subscription unavailable"
      );
      await setTimeout(5000);
    }
  }
}

export function runWorker(
  config: WorkerConfig,
  subscription: Subscription,
  storage: SourceStorage,
  projection: Projection,
  stopping: () => boolean,
  observe: Observer = ignoreObservation
) {
  return runDeliveryLoop(
    subscription,
    (messages) =>
      processBatch(
        messages,
        config,
        subscription,
        storage,
        projection,
        observe
      ),
    stopping
  );
}
