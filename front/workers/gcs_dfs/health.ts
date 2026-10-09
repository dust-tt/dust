import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";

import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Projection } from "@app/workers/gcs_dfs/processor";
import type {
  Metadata,
  Source,
  WorkerConfig,
} from "@app/workers/gcs_dfs/protocol";
import { RemoteError } from "@app/workers/gcs_dfs/transport";

export const HealthConfigSchema = z
  .object({
    topic: z
      .string()
      .regex(/^projects\/[a-zA-Z0-9-]+\/topics\/[a-zA-Z0-9._~+%-]+$/),
    deadLetterSubscription: z
      .string()
      .regex(/^projects\/[a-zA-Z0-9-]+\/subscriptions\/[a-zA-Z0-9._~+%-]+$/),
    deadlineSeconds: z.number().int().min(10).max(600).default(180),
    pollSeconds: z.number().int().min(1).max(10).default(2),
    maxBacklogAgeSeconds: z.number().int().min(1).max(86400).default(300),
    targets: z
      .array(
        z.object({
          bindingIndex: z.number().int().min(0),
          publisherServiceAccount: z
            .string()
            .regex(
              /^service-[0-9]+@gs-project-accounts\.iam\.gserviceaccount\.com$/
            ),
        })
      )
      .min(1)
      .max(64),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.targets.map((target) => target.bindingIndex)).size !==
      value.targets.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Canary bindings must be unique",
      });
    }
  });
export type HealthConfig = z.infer<typeof HealthConfigSchema>;
export type HealthCheck = {
  check:
    | "canary"
    | "notification"
    | "publisher_iam"
    | "subscription"
    | "backlog"
    | "dead_letters";
  target: number;
  healthy: boolean;
  reason: string;
  value?: number;
  durationMs?: number;
};
export type NotificationConfiguration = {
  topic: string;
  payload_format: string;
  event_types?: string[];
  object_name_prefix?: string;
};
export type MetricSample = { value: number; sampledAtMs: number };
export interface HealthTransport {
  metadata(source: Source): Promise<Metadata | null>;
  writeCanary(
    source: Source,
    expectedGeneration: string,
    body: string
  ): Promise<Metadata>;
  notification(
    bucket: string,
    configuration: string
  ): Promise<NotificationConfiguration>;
  publisherGranted(topic: string, serviceAccount: string): Promise<boolean>;
  subscription(name: string): Promise<{
    topic: string;
    deadLetterPolicy?: { deadLetterTopic: string };
  }>;
  metric(
    subscription: string,
    metric: "oldest_unacked_message_age" | "num_undelivered_messages"
  ): Promise<MetricSample | null>;
}

async function checkHealth(
  check: HealthCheck["check"],
  target: number,
  run: () => Promise<Omit<HealthCheck, "check" | "target">>
): Promise<HealthCheck> {
  try {
    return { check, target, ...(await run()) };
  } catch (error) {
    return {
      check,
      target,
      healthy: false,
      reason:
        error instanceof RemoteError
          ? `http_${error.statusCode}`
          : "check_unavailable",
    };
  }
}

export async function runHealthChecks(
  worker: WorkerConfig,
  health: HealthConfig,
  transport: HealthTransport,
  projection: Pick<Projection, "cursor">
): Promise<HealthCheck[]> {
  const targets = await concurrentExecutor(
    health.targets,
    async (target) => {
      const binding = worker.bindings[target.bindingIndex];
      if (!binding) {
        return [
          {
            check: "canary" as const,
            target: target.bindingIndex,
            healthy: false,
            reason: "binding_not_found",
          },
        ];
      }
      const source = {
        bucket: binding.bucket,
        name: `${binding.prefix}.dust-gcs-dfs-canary`,
      };
      const checks = await Promise.all([
        checkHealth("canary", target.bindingIndex, async () => {
          const startedMs = Date.now();
          const deadlineMs = startedMs + health.deadlineSeconds * 1000;
          const existing = await transport.metadata(source);
          const written = await transport.writeCanary(
            source,
            existing?.generation ?? "0",
            JSON.stringify({ nonce: randomUUID() })
          );
          if (
            written.bucket !== source.bucket ||
            written.name !== source.name ||
            written.generation === existing?.generation
          ) {
            return { healthy: false, reason: "canary_identity_mismatch" };
          }
          while (Date.now() < deadlineMs) {
            const cursor = await projection.cursor(binding, source);
            if (
              Date.now() < deadlineMs &&
              cursor?.generation === written.generation &&
              cursor.metageneration === written.metageneration &&
              !cursor.deleted
            ) {
              return {
                healthy: true,
                reason: "durable_generation_observed",
                durationMs: Date.now() - startedMs,
              };
            }
            await setTimeout(
              Math.max(
                0,
                Math.min(health.pollSeconds * 1000, deadlineMs - Date.now())
              )
            );
          }
          return {
            healthy: false,
            reason: "canary_timeout",
            durationMs: Date.now() - startedMs,
          };
        }),
        checkHealth("notification", target.bindingIndex, async () => {
          for (const configuration of binding.notificationConfigs) {
            const current = await transport.notification(
              binding.bucket,
              configuration
            );
            if (
              current.topic !== `//pubsub.googleapis.com/${health.topic}` ||
              current.payload_format !== "JSON_API_V1" ||
              !binding.prefix.startsWith(current.object_name_prefix ?? "") ||
              (current.event_types &&
                current.event_types.length > 0 &&
                ![
                  "OBJECT_FINALIZE",
                  "OBJECT_METADATA_UPDATE",
                  "OBJECT_ARCHIVE",
                  "OBJECT_DELETE",
                ].every((event) => current.event_types?.includes(event)))
            ) {
              return { healthy: false, reason: "notification_drift" };
            }
          }
          return { healthy: true, reason: "notification_matches" };
        }),
        checkHealth("publisher_iam", target.bindingIndex, async () => {
          const healthy = await transport.publisherGranted(
            health.topic,
            target.publisherServiceAccount
          );
          return {
            healthy,
            reason: healthy
              ? "publisher_grant_present"
              : "publisher_grant_missing",
          };
        }),
      ]);
      return checks;
    },
    { concurrency: 4 }
  );
  const subscriptions = await Promise.all([
    checkHealth("subscription", 0, async () => {
      const [source, dead] = await Promise.all([
        transport.subscription(worker.subscription),
        transport.subscription(health.deadLetterSubscription),
      ]);
      const healthy =
        source.topic === health.topic &&
        source.deadLetterPolicy?.deadLetterTopic === dead.topic &&
        dead.topic !== source.topic &&
        worker.subscription !== health.deadLetterSubscription;
      return {
        healthy,
        reason: healthy ? "subscription_matches" : "subscription_drift",
      };
    }),
    checkHealth("backlog", 0, async () => {
      const sample = await transport.metric(
        worker.subscription,
        "oldest_unacked_message_age"
      );
      if (
        !sample ||
        Date.now() - sample.sampledAtMs > 600_000 ||
        sample.sampledAtMs > Date.now()
      ) {
        return { healthy: false, reason: "metric_unavailable" };
      }
      const healthy = sample.value <= health.maxBacklogAgeSeconds;
      return {
        healthy,
        reason: healthy ? "backlog_within_threshold" : "backlog_too_old",
        value: sample.value,
      };
    }),
    checkHealth("dead_letters", 0, async () => {
      const sample = await transport.metric(
        health.deadLetterSubscription,
        "num_undelivered_messages"
      );
      if (
        !sample ||
        Date.now() - sample.sampledAtMs > 600_000 ||
        sample.sampledAtMs > Date.now()
      ) {
        return { healthy: false, reason: "metric_unavailable" };
      }
      const healthy = sample.value === 0;
      return {
        healthy,
        reason: healthy ? "dead_letters_empty" : "dead_letters_pending",
        value: sample.value,
      };
    }),
  ]);
  return [...targets.flat(), ...subscriptions];
}
