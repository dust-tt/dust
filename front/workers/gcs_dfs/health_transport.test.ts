import { GoogleAuth } from "google-auth-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GoogleHealthTransport } from "@app/workers/gcs_dfs/health_transport";
import { ConfigSchema } from "@app/workers/gcs_dfs/protocol";
import { RemoteError } from "@app/workers/gcs_dfs/transport";

function fixture(response: unknown, status = 200) {
  const config = ConfigSchema.parse({
    subscription: "projects/test-project/subscriptions/dfs",
    bindings: [
      {
        bucket: "bucket",
        prefix: "",
        tenant: "tenant",
        endpoint: "http://127.0.0.1:7544",
        tokenFile: "/unused",
        readers: [],
        notificationConfigs: [
          "projects/_/buckets/bucket/notificationConfigs/1",
        ],
      },
    ],
  });
  vi.spyOn(GoogleAuth.prototype, "getAccessToken").mockResolvedValue(
    "test-token"
  );
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () => new Response(JSON.stringify(response), { status })
    );
  vi.stubGlobal("fetch", fetchMock);
  return { transport: new GoogleHealthTransport(config), fetchMock };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GCS health cloud adapters", () => {
  it("uploads an encoded canary name with exact generation preconditions", async () => {
    const source = { bucket: "bucket", name: "canary/#?/.dust-gcs-dfs-canary" };
    const test = fixture({
      ...source,
      generation: "42",
      metageneration: "1",
      size: "2",
      updated: "2026-10-09T00:00:00Z",
    });
    const metadata = await test.transport.writeCanary(
      source,
      "9007199254740993",
      "{}"
    );
    expect(metadata.generation).toBe("42");
    const [input, init] = test.fetchMock.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin).toBe("https://storage.googleapis.com");
    expect(url.pathname).toBe("/upload/storage/v1/b/bucket/o");
    expect(url.searchParams.get("name")).toBe(source.name);
    expect(url.searchParams.get("ifGenerationMatch")).toBe("9007199254740993");
    expect(init).toMatchObject({
      method: "POST",
      body: "{}",
      redirect: "error",
      headers: { Authorization: "Bearer test-token" },
    });
  });

  it("does not follow cross-bucket notification identities", async () => {
    const test = fixture({});
    await expect(
      test.transport.notification(
        "bucket",
        "projects/_/buckets/other/notificationConfigs/1"
      )
    ).rejects.toEqual(new RemoteError(400));
    expect(test.fetchMock).not.toHaveBeenCalled();
  });

  it("requires the expected unconditional publisher grant and requests policy version three", async () => {
    const member =
      "serviceAccount:service-123@gs-project-accounts.iam.gserviceaccount.com";
    const test = fixture({
      bindings: [
        {
          role: "roles/pubsub.publisher",
          members: [member],
          condition: { expression: "false" },
        },
      ],
    });
    expect(
      await test.transport.publisherGranted(
        "projects/test-project/topics/events",
        member.slice("serviceAccount:".length)
      )
    ).toBe(false);
    expect(
      new URL(String(test.fetchMock.mock.calls[0][0])).searchParams.get(
        "options.requestedPolicyVersion"
      )
    ).toBe("3");
    test.fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          bindings: [{ role: "roles/pubsub.publisher", members: [member] }],
        })
      )
    );
    expect(
      await test.transport.publisherGranted(
        "projects/test-project/topics/events",
        member.slice("serviceAccount:".length)
      )
    ).toBe(true);
  });

  it("selects the latest backlog point and filters the exact project and subscription", async () => {
    const nowMs = Date.now();
    const test = fixture({
      timeSeries: [
        {
          points: [
            {
              interval: { endTime: new Date(nowMs - 60_000).toISOString() },
              value: { int64Value: "300" },
            },
            {
              interval: { endTime: new Date(nowMs).toISOString() },
              value: { int64Value: "0" },
            },
          ],
        },
      ],
    });
    expect(
      await test.transport.metric(
        "projects/test-project/subscriptions/dfs",
        "oldest_unacked_message_age"
      )
    ).toEqual({ value: 0, sampledAtMs: nowMs });
    const filter = new URL(
      String(test.fetchMock.mock.calls[0][0])
    ).searchParams.get("filter");
    expect(filter).toContain('resource.labels.project_id="test-project"');
    expect(filter).toContain('resource.labels.subscription_id="dfs"');
  });

  it.each([
    { timeSeries: [], nextPageToken: "more" },
    {
      timeSeries: [
        {
          points: [
            {
              interval: { endTime: "2026-10-09T00:00:00Z" },
              value: { int64Value: "9007199254740993" },
            },
          ],
        },
      ],
    },
  ])(
    "rejects incomplete or unrepresentable metric observations",
    async (response) => {
      const test = fixture(response);
      await expect(
        test.transport.metric(
          "projects/test-project/subscriptions/dead",
          "num_undelivered_messages"
        )
      ).rejects.toEqual(new RemoteError(503));
    }
  );

  it("propagates cloud permission failures without exposing remote response bodies", async () => {
    const test = fixture({ error: "sensitive remote detail" }, 403);
    await expect(
      test.transport.publisherGranted(
        "projects/test-project/topics/events",
        "service-123@gs-project-accounts.iam.gserviceaccount.com"
      )
    ).rejects.toEqual(new RemoteError(403));
  });
});
