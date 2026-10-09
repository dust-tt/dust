import { afterEach, describe, expect, it, vi } from "vitest";

import { RelayConfigSchema } from "@app/workers/gcs_dfs/protocol";
import { GoogleTransport } from "@app/workers/gcs_dfs/transport";

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    getAccessToken() {
      return Promise.resolve("test-token");
    }
  },
}));
afterEach(() => vi.unstubAllGlobals());

const config = RelayConfigSchema.parse({
  subscription: "projects/test/subscriptions/native",
  topic: "projects/test/topics/keyed",
  pubsubEndpoint: "https://europe-west1-pubsub.googleapis.com",
  bindings: [
    {
      bucket: "private",
      prefix: "w/one/",
      workspaceId: "one",
      notificationConfigs: ["config"],
    },
  ],
});

describe("regional Pub/Sub transport", () => {
  it("routes every Pub/Sub operation through the configured endpoint and preserves ordering keys", async () => {
    const message = {
      messageId: "input-id",
      data: "ZGF0YQ==",
      attributes: { custom: "value" },
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async (input) => {
        if (String(input).endsWith(":pull")) {
          return Response.json({
            receivedMessages: [
              { ackId: "ack", message: { ...message, orderingKey: "key" } },
            ],
          });
        }
        return Response.json(
          String(input).endsWith(":publish")
            ? { messageIds: ["output-id"] }
            : {}
        );
      });
    vi.stubGlobal("fetch", fetch);
    const transport = new GoogleTransport(config);
    expect((await transport.pull())[0].message.orderingKey).toBe("key");
    await transport.publish(config.topic, message, "key");
    await transport.acknowledge(["ack"]);
    await transport.lease(["ack"], 60);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${config.pubsubEndpoint}/v1/${config.subscription}:pull`,
      `${config.pubsubEndpoint}/v1/${config.topic}:publish`,
      `${config.pubsubEndpoint}/v1/${config.subscription}:acknowledge`,
      `${config.pubsubEndpoint}/v1/${config.subscription}:modifyAckDeadline`,
    ]);
    expect(fetch.mock.calls[1][1]?.body).toBe(
      JSON.stringify({
        messages: [
          {
            data: message.data,
            attributes: message.attributes,
            orderingKey: "key",
          },
        ],
      })
    );
  });

  it("requires a confirmed downstream message ID and rejects redirects", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetch);
    const transport = new GoogleTransport(config);
    await expect(
      transport.publish(
        config.topic,
        { messageId: "source", data: "", attributes: {} },
        "key"
      )
    ).rejects.toThrow();
    expect(fetch.mock.calls[0][1]?.redirect).toBe("error");
  });
});
