import { z } from "zod";

import type { HealthTransport } from "@app/workers/gcs_dfs/health";
import { MetadataSchema } from "@app/workers/gcs_dfs/protocol";
import type { Source } from "@app/workers/gcs_dfs/protocol";
import {
  GoogleTransport,
  readJson,
  RemoteError,
} from "@app/workers/gcs_dfs/transport";

const NotificationSchema = z.object({
  topic: z.string(),
  payload_format: z.string(),
  event_types: z.array(z.string()).optional(),
  object_name_prefix: z.string().optional(),
});
const PolicySchema = z.object({
  bindings: z
    .array(
      z.object({
        role: z.string(),
        members: z.array(z.string()),
        condition: z.unknown().optional(),
      })
    )
    .default([]),
});
const MetricsSchema = z.object({
  timeSeries: z
    .array(
      z.object({
        points: z.array(
          z.object({
            interval: z.object({
              endTime: z.string().datetime({ offset: true }),
            }),
            value: z.object({ int64Value: z.string().regex(/^[0-9]+$/) }),
          })
        ),
      })
    )
    .default([]),
  nextPageToken: z.string().optional(),
});

export class GoogleHealthTransport
  extends GoogleTransport
  implements HealthTransport
{
  private async json(url: URL, init?: RequestInit) {
    const response = await this.request(url.href, init);
    if (!response.ok) {
      await response.body?.cancel();
      throw new RemoteError(response.status);
    }
    return readJson(response, 1024 * 1024);
  }

  async writeCanary(source: Source, expectedGeneration: string, body: string) {
    const url = new URL(
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(source.bucket)}/o`
    );
    url.searchParams.set("uploadType", "media");
    url.searchParams.set("name", source.name);
    url.searchParams.set("ifGenerationMatch", expectedGeneration);
    return MetadataSchema.parse(await this.json(url, { method: "POST", body }));
  }

  async notification(bucket: string, configuration: string) {
    const prefix = `projects/_/buckets/${bucket}/notificationConfigs/`;
    if (
      !configuration.startsWith(prefix) ||
      !/^[0-9]+$/.test(configuration.slice(prefix.length))
    ) {
      throw new RemoteError(400);
    }
    return NotificationSchema.parse(
      await this.json(
        new URL(
          `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/notificationConfigs/${configuration.slice(prefix.length)}`
        )
      )
    );
  }

  async publisherGranted(topic: string, serviceAccount: string) {
    const url = new URL(
      `https://pubsub.googleapis.com/v1/${topic}:getIamPolicy`
    );
    url.searchParams.set("options.requestedPolicyVersion", "3");
    const policy = PolicySchema.parse(await this.json(url));
    return policy.bindings.some(
      (binding) =>
        binding.role === "roles/pubsub.publisher" &&
        !binding.condition &&
        binding.members.includes(`serviceAccount:${serviceAccount}`)
    );
  }

  async subscription(name: string) {
    if (
      !/^projects\/[a-zA-Z0-9-]+\/subscriptions\/[a-zA-Z0-9._~+%-]+$/.test(name)
    ) {
      throw new RemoteError(400);
    }
    return z
      .object({
        topic: z.string(),
        deadLetterPolicy: z.object({ deadLetterTopic: z.string() }).optional(),
      })
      .parse(
        await this.json(new URL(`https://pubsub.googleapis.com/v1/${name}`))
      );
  }

  async metric(
    subscription: string,
    metric: "oldest_unacked_message_age" | "num_undelivered_messages"
  ) {
    const resource =
      /^projects\/([a-zA-Z0-9-]+)\/subscriptions\/([a-zA-Z0-9._~+%-]+)$/.exec(
        subscription
      );
    if (!resource) {
      throw new RemoteError(400);
    }
    const url = new URL(
      `https://monitoring.googleapis.com/v3/projects/${resource[1]}/timeSeries`
    );
    url.searchParams.set(
      "filter",
      `metric.type="pubsub.googleapis.com/subscription/${metric}" AND resource.type="pubsub_subscription" AND resource.labels.project_id="${resource[1]}" AND resource.labels.subscription_id="${resource[2]}"`
    );
    const nowMs = Date.now();
    url.searchParams.set(
      "interval.startTime",
      new Date(nowMs - 900_000).toISOString()
    );
    url.searchParams.set("interval.endTime", new Date(nowMs).toISOString());
    url.searchParams.set("view", "FULL");
    url.searchParams.set("pageSize", "1000");
    const result = MetricsSchema.parse(await this.json(url));
    if (result.nextPageToken) {
      throw new RemoteError(503);
    }
    const samples = result.timeSeries.flatMap((series) =>
      series.points.map((point) => ({
        value: Number(point.value.int64Value),
        sampledAtMs: Date.parse(point.interval.endTime),
      }))
    );
    if (samples.some((sample) => !Number.isSafeInteger(sample.value))) {
      throw new RemoteError(503);
    }
    return (
      samples.sort(
        (left, right) =>
          right.sampledAtMs - left.sampledAtMs || right.value - left.value
      )[0] ?? null
    );
  }
}
