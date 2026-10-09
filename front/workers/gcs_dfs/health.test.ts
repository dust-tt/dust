import { describe, expect, it, vi } from "vitest";

import {
  HealthConfigSchema,
  runHealthChecks,
} from "@app/workers/gcs_dfs/health";
import type { HealthTransport } from "@app/workers/gcs_dfs/health";
import type { Projection } from "@app/workers/gcs_dfs/processor";
import { ConfigSchema } from "@app/workers/gcs_dfs/protocol";
import type { Metadata } from "@app/workers/gcs_dfs/protocol";
import { RemoteError } from "@app/workers/gcs_dfs/transport";

function fixture() {
  const worker = ConfigSchema.parse({
    subscription: "projects/test-project/subscriptions/dfs",
    bindings: [
      {
        bucket: "source-bucket",
        prefix: "canaries/",
        tenant: "test-tenant",
        endpoint: "http://127.0.0.1:7544",
        tokenFile: "/unused",
        readers: [],
        notificationConfigs: [
          "projects/_/buckets/source-bucket/notificationConfigs/1",
        ],
      },
    ],
  });
  const health = HealthConfigSchema.parse({
    topic: "projects/test-project/topics/events",
    deadLetterSubscription: "projects/test-project/subscriptions/dead",
    targets: [
      {
        bindingIndex: 0,
        publisherServiceAccount:
          "service-123@gs-project-accounts.iam.gserviceaccount.com",
      },
    ],
  });
  const metadata: Metadata = {
    bucket: "source-bucket",
    name: "canaries/.dust-gcs-dfs-canary",
    generation: "42",
    metageneration: "1",
    size: "48",
    updated: "2026-10-09T00:00:00Z",
  };
  const transport: HealthTransport = {
    metadata: vi.fn(async () => ({
      ...metadata,
      generation: "9007199254740993",
    })),
    writeCanary: vi.fn(async () => metadata),
    notification: vi.fn(async () => ({
      topic: `//pubsub.googleapis.com/${health.topic}`,
      payload_format: "JSON_API_V1",
    })),
    publisherGranted: vi.fn(async () => true),
    subscription: vi.fn(async (name) =>
      name === worker.subscription
        ? {
            topic: health.topic,
            deadLetterPolicy: {
              deadLetterTopic: "projects/test-project/topics/dead",
            },
          }
        : { topic: "projects/test-project/topics/dead" }
    ),
    metric: vi.fn(async () => ({ value: 0, sampledAtMs: Date.now() })),
  };
  const projection: Pick<Projection, "cursor"> = {
    cursor: vi.fn(async () => ({
      generation: metadata.generation,
      metageneration: "1",
      deleted: false,
    })),
  };
  return { worker, health, metadata, transport, projection };
}

describe("GCS DFS health checks", () => {
  it("writes only the reserved canary with a generation precondition and observes durable arrival", async () => {
    const test = fixture();
    const checks = await runHealthChecks(
      test.worker,
      test.health,
      test.transport,
      test.projection
    );
    expect(checks).toHaveLength(6);
    expect(checks.every((check) => check.healthy)).toBe(true);
    expect(test.transport.writeCanary).toHaveBeenCalledWith(
      { bucket: "source-bucket", name: "canaries/.dust-gcs-dfs-canary" },
      "9007199254740993",
      expect.stringContaining("nonce")
    );
    expect(test.projection.cursor).toHaveBeenCalledWith(
      test.worker.bindings[0],
      {
        bucket: "source-bucket",
        name: "canaries/.dust-gcs-dfs-canary",
      }
    );
  });

  it("uses create-only preconditions for a missing canary", async () => {
    const test = fixture();
    test.transport.metadata = vi.fn(async () => null);
    await runHealthChecks(
      test.worker,
      test.health,
      test.transport,
      test.projection
    );
    expect(test.transport.writeCanary).toHaveBeenCalledWith(
      expect.anything(),
      "0",
      expect.any(String)
    );
  });

  it.each([
    { generation: "9007199254740993", metageneration: "1", deleted: false },
    { generation: "42", metageneration: "1", deleted: true },
    { generation: "42", metageneration: "2", deleted: false },
    null,
  ])(
    "fails when the newly written live cursor does not arrive: %j",
    async (cursor) => {
      const test = fixture();
      const nowMs = Date.now();
      const now = vi.spyOn(Date, "now").mockReturnValue(nowMs);
      test.projection.cursor = vi.fn(async () => {
        now.mockReturnValue(nowMs + test.health.deadlineSeconds * 1000);
        return cursor;
      });
      try {
        const checks = await runHealthChecks(
          test.worker,
          test.health,
          test.transport,
          test.projection
        );
        expect(checks).toContainEqual(
          expect.objectContaining({
            check: "canary",
            healthy: false,
            reason: "canary_timeout",
          })
        );
      } finally {
        now.mockRestore();
      }
    }
  );

  it("reports IAM and notification drift even when the canary fails", async () => {
    const test = fixture();
    test.transport.writeCanary = vi.fn(async () => {
      throw new RemoteError(403);
    });
    test.transport.notification = vi.fn(async () => ({
      topic: `//pubsub.googleapis.com/${test.health.topic}`,
      payload_format: "JSON_API_V1",
      event_types: ["OBJECT_FINALIZE"],
    }));
    test.transport.publisherGranted = vi.fn(async () => false);
    const checks = await runHealthChecks(
      test.worker,
      test.health,
      test.transport,
      test.projection
    );
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: "canary",
          healthy: false,
          reason: "http_403",
        }),
        expect.objectContaining({
          check: "notification",
          healthy: false,
          reason: "notification_drift",
        }),
        expect.objectContaining({
          check: "publisher_iam",
          healthy: false,
          reason: "publisher_grant_missing",
        }),
      ])
    );
    expect(test.projection.cursor).not.toHaveBeenCalled();
  });

  it.each([
    {
      topic: "//pubsub.googleapis.com/projects/other/topics/wrong",
      payload_format: "JSON_API_V1",
    },
    {
      topic: "//pubsub.googleapis.com/projects/test-project/topics/events",
      payload_format: "NONE",
    },
    {
      topic: "//pubsub.googleapis.com/projects/test-project/topics/events",
      payload_format: "JSON_API_V1",
      object_name_prefix: "canaries/narrow/",
    },
  ])("detects routing drift: %j", async (notification) => {
    const test = fixture();
    test.transport.notification = vi.fn(async () => notification);
    const checks = await runHealthChecks(
      test.worker,
      test.health,
      test.transport,
      test.projection
    );
    expect(checks).toContainEqual(
      expect.objectContaining({ check: "notification", healthy: false })
    );
  });

  it("alerts on backlog age and retained dead letters without consuming them", async () => {
    const test = fixture();
    test.transport.metric = vi.fn(async (_subscription, metric) => ({
      value: metric === "oldest_unacked_message_age" ? 301 : 1,
      sampledAtMs: Date.now(),
    }));
    const checks = await runHealthChecks(
      test.worker,
      test.health,
      test.transport,
      test.projection
    );
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: "backlog",
          healthy: false,
          value: 301,
        }),
        expect.objectContaining({
          check: "dead_letters",
          healthy: false,
          value: 1,
        }),
      ])
    );
  });

  it.each([null, { value: 0, sampledAtMs: 0 }])(
    "treats missing or stale metrics as unhealthy: %j",
    async (sample) => {
      const test = fixture();
      test.transport.metric = vi.fn(async () => sample);
      const checks = await runHealthChecks(
        test.worker,
        test.health,
        test.transport,
        test.projection
      );
      expect(
        checks.filter((check) => check.reason === "metric_unavailable")
      ).toHaveLength(2);
    }
  );

  it("rejects an unrelated dead-letter subscription", async () => {
    const test = fixture();
    test.transport.subscription = vi.fn(async (name) =>
      name === test.worker.subscription
        ? {
            topic: test.health.topic,
            deadLetterPolicy: {
              deadLetterTopic: "projects/test-project/topics/dead",
            },
          }
        : { topic: "projects/test-project/topics/unrelated" }
    );
    const checks = await runHealthChecks(
      test.worker,
      test.health,
      test.transport,
      test.projection
    );
    expect(checks).toContainEqual(
      expect.objectContaining({
        check: "subscription",
        healthy: false,
        reason: "subscription_drift",
      })
    );
  });

  it("does not disguise missing policy-read permissions as a healthy grant", async () => {
    const test = fixture();
    test.transport.publisherGranted = vi.fn(async () => {
      throw new RemoteError(403);
    });
    const checks = await runHealthChecks(
      test.worker,
      test.health,
      test.transport,
      test.projection
    );
    expect(checks).toContainEqual(
      expect.objectContaining({
        check: "publisher_iam",
        healthy: false,
        reason: "http_403",
      })
    );
  });
});
