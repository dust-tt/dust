import { describe, expect, it, vi } from "vitest";

import { canaryConfig } from "@app/workers/gcs_dfs/canary.test_helpers";
import { checkDrift } from "@app/workers/gcs_dfs/drift";
import type { GoogleHealthTransport } from "@app/workers/gcs_dfs/health_transport";

function fixture() {
  const config = canaryConfig();
  const subscription = vi.fn<GoogleHealthTransport["subscription"]>(
    async (name) => {
      const hop = name.includes("worker") ? config.worker : config.relay;
      return {
        topic: name.endsWith("dead") ? hop.deadLetterTopic : hop.topic,
        deadLetterPolicy: name.endsWith("dead")
          ? undefined
          : { deadLetterTopic: hop.deadLetterTopic, maxDeliveryAttempts: 10 },
        enableMessageOrdering: name === config.worker.subscription,
        expirationPolicy: {},
        messageRetentionDuration: name.endsWith("dead")
          ? "1209600s"
          : "604800s",
        retainAckedMessages: true,
      };
    }
  );
  const transport = {
    subscription,
    roleGranted: vi.fn(async () => true),
    notification: vi.fn<GoogleHealthTransport["notification"]>(async () => ({
      topic: `//pubsub.googleapis.com/${config.relay.topic}`,
      payload_format: "JSON_API_V1",
    })),
    metric: vi.fn<GoogleHealthTransport["metric"]>(async () => ({
      value: 0,
      sampledAtMs: Date.now(),
    })),
  };
  const observer = vi.fn();
  const run = () => checkDrift(config, transport, observer);
  return { config, transport, run, observer };
}

describe("two-hop cloud drift", () => {
  it("checks both links, retained DLQs, publishers, subscribers and forwarding service agents", async () => {
    const test = fixture();
    expect((await test.run()).every((check) => check.healthy)).toBe(true);
    expect(test.transport.subscription).toHaveBeenCalledTimes(4);
    expect(test.transport.roleGranted).toHaveBeenCalledTimes(8);
    expect(test.transport.metric).toHaveBeenCalledTimes(4);
    expect(test.observer).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "iam_drift", hop: "importer" })
    );
  });

  it("rejects missing event coverage", async () => {
    const test = fixture();
    test.transport.notification.mockResolvedValue({
      topic: `//pubsub.googleapis.com/${test.config.relay.topic}`,
      payload_format: "JSON_API_V1",
      event_types: ["OBJECT_FINALIZE"],
    });
    expect((await test.run())[0].healthy).toBe(false);
  });

  it.each([
    { enableMessageOrdering: false },
    { messageRetentionDuration: "600s" },
    { expirationPolicy: { ttl: "86400s" } },
    {
      deadLetterPolicy: {
        deadLetterTopic: "projects/test/topics/wrong",
        maxDeliveryAttempts: 10,
      },
    },
  ])("rejects subscription drift %j", async (drift) => {
    const test = fixture();
    const get = test.transport.subscription.getMockImplementation()!;
    test.transport.subscription.mockImplementation(async (name) => ({
      ...(await get(name)),
      ...(name === test.config.worker.subscription ? drift : {}),
    }));
    expect(
      (await test.run())
        .filter((check) => check.operation === "subscription_drift")
        .map((check) => check.healthy)
    ).toEqual([true, false]);
  });

  it("fails closed on IAM failure without skipping other checks", async () => {
    const test = fixture();
    test.transport.roleGranted.mockRejectedValue(new Error("forbidden"));
    const result = await test.run();
    expect(
      result
        .filter((check) => check.operation === "iam_drift")
        .every((check) => !check.healthy)
    ).toBe(true);
    expect(test.transport.metric).toHaveBeenCalledTimes(4);
  });

  it.each([
    null,
    { value: 0, sampledAtMs: 0 },
    { value: 301, sampledAtMs: Date.now() },
  ])("fails closed on missing, stale or unhealthy samples", async (sample) => {
    const test = fixture();
    test.transport.metric.mockResolvedValue(sample);
    const result = await test.run();
    expect(
      result
        .filter(
          (check) =>
            check.operation === "backlog" || check.operation === "dead_letters"
        )
        .every((check) => !check.healthy)
    ).toBe(true);
  });
});
