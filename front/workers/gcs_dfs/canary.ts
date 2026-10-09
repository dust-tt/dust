import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";

import {
  BindingSchema,
  TransportConfigSchema,
} from "@app/workers/gcs_dfs/protocol";
import type { Source } from "@app/workers/gcs_dfs/protocol";
import type { Observer } from "@app/workers/gcs_dfs/telemetry";
import { errorClass } from "@app/workers/gcs_dfs/telemetry";

export class CanaryFailure extends Error {
  constructor(
    readonly reason:
      | "reader_not_denied"
      | "allowed_reader_denied"
      | "content_mismatch"
      | "convergence_timeout"
      | "delete_not_converged"
  ) {
    super(reason);
  }
}

const TopicSchema = z
  .string()
  .regex(/^projects\/[a-zA-Z0-9-]+\/topics\/[a-zA-Z0-9._~+%-]+$/);
const SubscriptionSchema = z
  .string()
  .regex(/^projects\/[a-zA-Z0-9-]+\/subscriptions\/[a-zA-Z0-9._~+%-]+$/);
const ServiceAccountSchema = z.string().email();
const HopSchema = z
  .object({
    topic: TopicSchema,
    subscription: SubscriptionSchema,
    deadLetterTopic: TopicSchema,
    deadLetterSubscription: SubscriptionSchema,
    publisherServiceAccount: ServiceAccountSchema,
    subscriberServiceAccount: ServiceAccountSchema,
    pubsubServiceAgent: ServiceAccountSchema,
    maxDeliveryAttempts: z.number().int().min(5).max(100).default(10),
    minRetentionSeconds: z.number().int().min(600).max(2678400).default(604800),
    minDeadLetterRetentionSeconds: z
      .number()
      .int()
      .min(600)
      .max(2678400)
      .default(1209600),
  })
  .strict();

export const CanaryConfigSchema = TransportConfigSchema.pick({
  pubsubEndpoint: true,
  requestTimeoutMs: true,
  environment: true,
  cell: true,
})
  .extend({
    deadlineSeconds: z.number().int().min(10).max(600).default(180),
    pollSeconds: z.number().int().min(1).max(10).default(2),
    maxBacklogAgeSeconds: z.number().int().min(1).max(86400).default(300),
    relay: HopSchema,
    worker: HopSchema,
    binding: BindingSchema.omit({
      tokenFile: true,
      readers: true,
      stagingDirectoryId: true,
      writerSubject: true,
    })
      .extend({
        workspaceId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
        allowedReaderTokenFile: z.string().min(1),
        deniedReaderTokenFile: z.string().min(1),
        notificationConfigs: z.array(z.string().min(1)).min(1).max(32),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.pubsubEndpoint === "https://pubsub.googleapis.com" ||
      value.binding.prefix !== `files/w/${value.binding.workspaceId}/` ||
      value.binding.allowedReaderTokenFile ===
        value.binding.deniedReaderTokenFile ||
      new Set([
        value.relay.topic,
        value.worker.topic,
        value.relay.deadLetterTopic,
        value.worker.deadLetterTopic,
      ]).size !== 4 ||
      new Set([
        value.relay.subscription,
        value.worker.subscription,
        value.relay.deadLetterSubscription,
        value.worker.deadLetterSubscription,
      ]).size !== 4
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Canary requires regional two-hop queues, a private file workspace binding and distinct readers",
      });
    }
  });
export type CanaryConfig = z.infer<typeof CanaryConfigSchema>;
export type CanaryCheck = {
  operation:
    | "canary_run"
    | "canary_create"
    | "canary_update"
    | "canary_delete"
    | "canary_cleanup"
    | "notification_drift"
    | "iam_drift"
    | "subscription_drift"
    | "backlog"
    | "dead_letters";
  healthy: boolean;
  durationMs: number;
  reason: string;
  hop?: "relay" | "importer";
};
export interface CanaryProducer {
  create(body: string): Promise<Source>;
  update(body: string): Promise<void>;
  remove(): Promise<void>;
}
export type ReaderResult =
  | { status: "found"; bytes: Buffer }
  | { status: "missing" | "denied" };
export interface CanaryReader {
  read(source: Source, reader: "allowed" | "denied"): Promise<ReaderResult>;
  sourceExists(source: Source): Promise<boolean>;
}

export async function observeCheck(
  operation: CanaryCheck["operation"],
  run: () => Promise<boolean>,
  observer: Observer
): Promise<CanaryCheck> {
  const start = Date.now();
  let healthy = false;
  let reason = "check_failed";
  try {
    healthy = await run();
    if (healthy) {
      reason = "none";
    }
  } catch (error) {
    healthy = false;
    reason = error instanceof CanaryFailure ? error.reason : errorClass(error);
  }
  const durationMs = Date.now() - start;
  observer({
    operation,
    outcome: healthy ? "success" : "error",
    durationMs,
    errorClass: reason,
  });
  return { operation, healthy, durationMs, reason };
}

export async function runCanary(
  config: Pick<CanaryConfig, "deadlineSeconds" | "pollSeconds">,
  producer: CanaryProducer,
  reader: CanaryReader,
  observer: Observer,
  producerObserver: Observer,
  wait = (ms: number) => setTimeout(ms),
  signal?: AbortSignal
): Promise<CanaryCheck[]> {
  const checks: CanaryCheck[] = [];
  let source: Source | undefined;
  async function mutate(
    operation: "create" | "update" | "delete",
    run: () => Promise<void>,
    body?: string
  ) {
    const start = Date.now();
    try {
      signal?.throwIfAborted();
      await run();
      producerObserver({
        operation,
        outcome: "success",
        durationMs: Date.now() - start,
        bytes: body === undefined ? undefined : Buffer.byteLength(body),
      });
    } catch (error) {
      producerObserver({
        operation,
        outcome: "error",
        durationMs: Date.now() - start,
      });
      throw error;
    }
  }
  async function converged(body: string | null): Promise<boolean> {
    if (!source) {
      return false;
    }
    const deadline = Date.now() + config.deadlineSeconds * 1000;
    let lastStatus: "found" | "missing" | "denied" = "missing";
    do {
      signal?.throwIfAborted();
      const actual = await reader.read(source, "allowed");
      lastStatus = actual.status;
      if (Date.now() >= deadline) {
        break;
      }
      if (actual.status === "denied") {
        throw new CanaryFailure("allowed_reader_denied");
      }
      if (body === null) {
        if (
          actual.status === "missing" &&
          !(await reader.sourceExists(source))
        ) {
          return Date.now() < deadline;
        }
      } else if (
        actual.status === "found" &&
        actual.bytes.equals(Buffer.from(body))
      ) {
        if ((await reader.read(source, "denied")).status !== "denied") {
          throw new CanaryFailure("reader_not_denied");
        }
        return Date.now() < deadline;
      }
      await wait(
        Math.min(config.pollSeconds * 1000, Math.max(0, deadline - Date.now()))
      );
    } while (Date.now() < deadline);
    throw new CanaryFailure(
      body === null
        ? "delete_not_converged"
        : lastStatus === "found"
          ? "content_mismatch"
          : "convergence_timeout"
    );
  }
  try {
    for (const operation of ["create", "update"] as const) {
      const body = `dust-gcs-dfs-canary:${randomUUID()}:${operation}\n`;
      const check = await observeCheck(
        `canary_${operation}`,
        async () => {
          await mutate(
            operation,
            async () => {
              if (operation === "create") {
                source = await producer.create(body);
              } else {
                await producer.update(body);
              }
            },
            body
          );
          return converged(body);
        },
        observer
      );
      checks.push(check);
      if (!check.healthy) {
        return checks;
      }
    }
    checks.push(
      await observeCheck(
        "canary_delete",
        async () => {
          await mutate("delete", () => producer.remove());
          return converged(null);
        },
        observer
      )
    );
    return checks;
  } finally {
    checks.push(
      await observeCheck(
        "canary_cleanup",
        async () => {
          await producer.remove();
          return true;
        },
        observer
      )
    );
  }
}
