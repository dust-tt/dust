import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Metadata, Server, ServerCredentials, status } from "@grpc/grpc-js";
import type { ServerUnaryCall, sendUnaryData } from "@grpc/grpc-js";
import { GoogleAuth } from "google-auth-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { encodeDfsMessage } from "@app/lib/dfs/proto";
import type { DfsWireMessage } from "@app/lib/dfs/proto";
import { getDfsServiceDefinition } from "@app/tests/utils/dfs/dfsServiceDefinition";
import { DfsWireFactory } from "@app/tests/utils/dfs/DfsWireFactory";
import { canaryConfig } from "@app/workers/gcs_dfs/canary.test_helpers";
import { CanaryTransport } from "@app/workers/gcs_dfs/canary_transport";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const source = { bucket: "private", name: "files/w/workspace/file/original" };
const identity = createHash("sha256")
  .update(JSON.stringify([source.bucket, source.name]))
  .digest("hex");
const directoryId = "0190c3a0b1c27d4e8f0a1b2c3d4e5f60";
const fileId = "0190c3a0b1c37aaa9bbbccccddddeeee";
const allowedKey = "a".repeat(64);
const deniedKey = "d".repeat(64);
type Call = ServerUnaryCall<DfsWireMessage, DfsWireMessage>;
type Callback = sendUnaryData<DfsWireMessage>;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture(
  options: {
    lookupError?: string;
    revoked?: boolean;
    tenant?: string;
    unsupported?: boolean;
    size?: number;
  } = {}
) {
  vi.mocked(readFile).mockImplementation(async (path) =>
    path === "/allowed" ? allowedKey : deniedKey
  );
  const calls: {
    method: string;
    authorization: unknown;
    request: DfsWireMessage;
  }[] = [];
  let sessionChecks = 0;
  const record = (method: string, call: Call) =>
    calls.push({
      method,
      authorization: call.metadata.get("authorization")[0],
      request: call.request,
    });
  const failure = (callback: Callback, code: status, wireCode: string) => {
    const metadata = new Metadata();
    metadata.set(
      "grpc-status-details-bin",
      encodeDfsMessage("ErrorDetails", { code: wireCode })
    );
    callback({ code, details: "dfs error", metadata });
  };
  const server = new Server();
  server.addService(getDfsServiceDefinition(), {
    CurrentSession: (call: Call, callback: Callback) => {
      record("CurrentSession", call);
      sessionChecks++;
      if (options.unsupported) {
        failure(callback, status.UNIMPLEMENTED, "UNSUPPORTED");
        return;
      }
      if (options.revoked && sessionChecks > 1) {
        failure(callback, status.UNAUTHENTICATED, "UNAUTHENTICATED");
        return;
      }
      callback(
        null,
        DfsWireFactory.session({
          tenantId: options.tenant ?? "tenant",
          expiresAt: String(Date.now() + 3600000),
        })
      );
    },
    Lookup: (call: Call, callback: Callback) => {
      record("Lookup", call);
      if (options.lookupError) {
        callback(null, { results: [{ error: { code: options.lookupError } }] });
        return;
      }
      const {
        targets: [{ name }],
      } = z
        .object({ targets: z.array(z.object({ name: z.string() })).length(1) })
        .parse(call.request);
      callback(null, {
        results: [
          {
            object: DfsWireFactory.attr(
              name === identity ? fileId : directoryId,
              { name, kind: name === identity ? "FILE" : "DIRECTORY" }
            ),
          },
        ],
      });
    },
    Read: (call: Call, callback: Callback) => {
      record("Read", call);
      callback(null, {
        data: Buffer.from("nonce"),
        object: DfsWireFactory.attr(fileId, {
          name: identity,
          size: String(options.size ?? 5),
          mode: 0o400,
        }),
      });
    },
  });
  const port = await new Promise<number>((resolve, reject) =>
    server.bindAsync(
      "127.0.0.1:0",
      ServerCredentials.createInsecure(),
      (error, port) => (error ? reject(error) : resolve(port))
    )
  );
  const config = canaryConfig();
  const transport = new CanaryTransport({
    ...config,
    binding: { ...config.binding, endpoint: `http://127.0.0.1:${port}` },
  });
  return {
    transport,
    calls,
    close: () => {
      transport.close();
      server.forceShutdown();
    },
  };
}

describe("canonical DFS canary transport", () => {
  it("uses the shared typed client with bearer metadata, configured directory lookup and snapshot-coherent reads", async () => {
    const test = await fixture();
    try {
      expect(await test.transport.read(source, "allowed")).toEqual({
        status: "found",
        bytes: Buffer.from("nonce"),
      });
      expect(test.calls.map((call) => call.method)).toEqual([
        "CurrentSession",
        "Lookup",
        "Read",
      ]);
      expect(
        test.calls.every(
          (call) => call.authorization === `Bearer ${allowedKey}`
        )
      ).toBe(true);
      expect(test.calls[1].request).toMatchObject({
        targets: [
          {
            parentId: { id: { value: Buffer.from(directoryId, "hex") } },
            name: identity,
          },
        ],
      });
      expect(test.calls[1].request).toMatchObject({
        targets: [{ name: identity }],
      });
      expect(test.calls[2].request).toMatchObject({
        objectId: { value: Buffer.from(fileId, "hex") },
        offset: "0",
        length: 65536,
      });
    } finally {
      test.close();
    }
  });

  it("accepts forbidden only for a still-valid same-tenant reader session", async () => {
    const test = await fixture({ lookupError: "FORBIDDEN" });
    try {
      expect(await test.transport.read(source, "denied")).toEqual({
        status: "denied",
      });
      expect(test.calls.map((call) => call.method)).toEqual([
        "CurrentSession",
        "Lookup",
        "CurrentSession",
      ]);
      expect(
        test.calls.every((call) => call.authorization === `Bearer ${deniedKey}`)
      ).toBe(true);
    } finally {
      test.close();
    }
  });

  it.each([
    { options: { lookupError: "UNAUTHENTICATED" }, code: "unauthenticated" },
    {
      options: { lookupError: "FORBIDDEN", revoked: true },
      code: "unauthenticated",
    },
    { options: { tenant: "another-tenant" }, code: "invalid_input" },
    { options: { unsupported: true }, code: "unsupported" },
  ])(
    "rejects invalid authority and unsupported handlers: $code",
    async ({ options, code }) => {
      const test = await fixture(options);
      try {
        await expect(
          test.transport.read(source, "denied")
        ).rejects.toMatchObject({ code });
      } finally {
        test.close();
      }
    }
  );

  it("distinguishes namespace absence from permission denial", async () => {
    const test = await fixture({ lookupError: "NOT_FOUND" });
    try {
      expect(await test.transport.read(source, "allowed")).toEqual({
        status: "missing",
      });
    } finally {
      test.close();
    }
  });

  it("bounds complete canary content using the read's own attributes", async () => {
    const test = await fixture({ size: 65537 });
    try {
      await expect(
        test.transport.read(source, "allowed")
      ).rejects.toMatchObject({ code: "capacity" });
    } finally {
      test.close();
    }
  });

  it("checks both reader credentials before producer allocation", async () => {
    const test = await fixture();
    try {
      await test.transport.checkReaders();
      expect(test.calls.map((call) => call.authorization)).toEqual([
        `Bearer ${allowedKey}`,
        `Bearer ${deniedKey}`,
      ]);
      expect(test.calls.map((call) => call.method)).toEqual([
        "CurrentSession",
        "CurrentSession",
      ]);
    } finally {
      test.close();
    }
  });

  it("keeps regional REST routing for Google drift reads", async () => {
    vi.spyOn(GoogleAuth.prototype, "getAccessToken").mockResolvedValue(
      "adc-token"
    );
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ topic: "projects/test/topics/relay" }))
      );
    vi.stubGlobal("fetch", request);
    const transport = new CanaryTransport(canaryConfig());
    try {
      await transport.subscription("projects/test/subscriptions/relay");
      expect(String(request.mock.calls[0][0])).toBe(
        "https://europe-west1-pubsub.googleapis.com/v1/projects/test/subscriptions/relay"
      );
    } finally {
      transport.close();
    }
  });
});
