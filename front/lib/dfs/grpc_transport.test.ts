// @vitest-environment node
import { DfsClient } from "@app/lib/dfs/client";
import { DfsGrpcTransport } from "@app/lib/dfs/grpc_transport";
import type { DfsWireMessage } from "@app/lib/dfs/proto";
import { encodeDfsMessage, getDfsServiceDefinition } from "@app/lib/dfs/proto";
import type {
  sendUnaryData,
  ServerUnaryCall,
  UntypedServiceImplementation,
} from "@grpc/grpc-js";
import { Metadata, Server, ServerCredentials, status } from "@grpc/grpc-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT_ID = "0190c3a0b1c27d4e8f0a1b2c3d4e5f60";
const FILE_ID = "0190c3a0b1c37aaa9bbbccccddddeeee";
// Just over grpc-js's default 4 MiB receive limit, within the server's reply budget plus framing.
const LARGE_REPLY_BYTES = 4 * 1024 * 1024 + 16 * 1024;
const SESSION_KEY = "k".repeat(64);
const WIRE_VIEW = { storeVersion: "1", authVersion: "1" };

type UnaryCall = ServerUnaryCall<DfsWireMessage, DfsWireMessage>;
type Callback = sendUnaryData<DfsWireMessage>;

function dfsStatusError(code: status, wireCode: string) {
  const metadata = new Metadata();
  metadata.set(
    "grpc-status-details-bin",
    encodeDfsMessage("ErrorDetails", { code: wireCode })
  );
  return { code, details: "dfs error", metadata };
}

function firstTargetName(request: DfsWireMessage): unknown {
  const { targets } = request;
  const [first] = Array.isArray(targets) ? targets : [];
  return typeof first === "object" && first !== null && "name" in first
    ? first.name
    : undefined;
}

function isAuthorized(call: UnaryCall): boolean {
  return call.metadata.get("authorization")[0] === `Bearer ${SESSION_KEY}`;
}

// A minimal in-process Dfs server returning canned answers.
const implementation: UntypedServiceImplementation = {
  CurrentSession: (call: UnaryCall, callback: Callback) => {
    if (!isAuthorized(call)) {
      callback(dfsStatusError(status.UNAUTHENTICATED, "UNAUTHENTICATED"));
      return;
    }
    callback(null, {
      id: "session-1",
      tenantId: "tenant-1",
      subjects: ["g:eng"],
      sessionKey: "",
      expiresAt: "1700003600000",
      rootId: { value: Buffer.from(ROOT_ID, "hex") },
    });
  },
  Lookup: (call: UnaryCall, callback: Callback) => {
    const name = firstTargetName(call.request);
    if (name === "rpc-failure") {
      // Request-wide failure with ErrorDetails.
      callback(dfsStatusError(status.FAILED_PRECONDITION, "NOT_DIRECTORY"));
      return;
    }
    if (name === "busy") {
      // gRPC status alone, without ErrorDetails.
      callback({ code: status.RESOURCE_EXHAUSTED, details: "busy" });
      return;
    }
    callback(null, {
      results: [
        {
          object: {
            id: { id: { value: Buffer.from(ROOT_ID, "hex") } },
            name: "docs",
            directory: true,
            size: "0",
            mode: 0o700,
            attrVersion: "1",
            contentVersion: "1",
            view: WIRE_VIEW,
          },
        },
      ],
    });
  },
  CloseSession: (_call: UnaryCall, callback: Callback) => {
    callback(null, {});
  },
  Read: (_call: UnaryCall, callback: Callback) => {
    callback(null, {
      data: Buffer.alloc(LARGE_REPLY_BYTES, 1),
      object: {
        id: { id: { value: Buffer.from(FILE_ID, "hex") } },
        name: "large.bin",
        directory: false,
        size: String(LARGE_REPLY_BYTES),
        mode: 0o600,
        attrVersion: "1",
        contentVersion: "1",
        view: WIRE_VIEW,
      },
    });
  },
};

describe("DfsGrpcTransport", () => {
  let server: Server;
  let transport: DfsGrpcTransport;

  beforeAll(async () => {
    server = new Server();
    server.addService(getDfsServiceDefinition(), implementation);
    const port = await new Promise<number>((resolve, reject) => {
      server.bindAsync(
        "127.0.0.1:0",
        ServerCredentials.createInsecure(),
        (err, boundPort) => (err ? reject(err) : resolve(boundPort))
      );
    });
    transport = new DfsGrpcTransport({
      endpoint: `127.0.0.1:${port}`,
      useTls: false,
      timeoutMs: 2_000,
    });
  });

  afterAll(() => {
    transport.close();
    server.forceShutdown();
  });

  it("sends the key as bearer metadata and decodes the response", async () => {
    const client = new DfsClient(transport, SESSION_KEY);

    const res = await client.currentSession();

    expect(res.isOk() && res.value).toEqual({
      id: "session-1",
      tenantId: "tenant-1",
      subjects: ["g:eng"],
      sessionKey: "",
      expiresAtMs: 1700003600000,
      rootId: ROOT_ID,
    });
  });

  it("maps ErrorDetails from the status trailer", async () => {
    const unauthenticated = await new DfsClient(
      transport,
      "wrong"
    ).currentSession();
    expect(unauthenticated.isErr() && unauthenticated.error.code).toBe(
      "unauthenticated"
    );

    const failed = await new DfsClient(transport, SESSION_KEY).lookup({
      targets: [{ parentId: "root", name: "rpc-failure" }],
    });
    expect(failed.isErr() && failed.error.code).toBe("not_directory");
  });

  it("falls back to the gRPC status code without ErrorDetails", async () => {
    const res = await new DfsClient(transport, SESSION_KEY).lookup({
      targets: [{ parentId: "root", name: "busy" }],
    });

    expect(res.isErr() && res.error.code).toBe("capacity");
  });

  it("round-trips a successful lookup and an empty response", async () => {
    const client = new DfsClient(transport, SESSION_KEY);

    const lookup = await client.lookup({
      targets: [{ parentId: "root", name: "docs" }],
    });
    expect(lookup.isOk() && lookup.value.results[0]).toMatchObject({
      status: "ok",
      object: { id: ROOT_ID, name: "docs", directory: true },
    });
    expect(lookup.isOk() && lookup.value.results[0]).toMatchObject({
      object: {
        mode: 0o700,
        attrVersion: BigInt("1"),
      },
    });

    const closed = await client.closeSession();
    expect(closed.isOk()).toBe(true);
  });

  it("accepts replies slightly above 4 MiB", async () => {
    const res = await new DfsClient(transport, SESSION_KEY).read({
      objectId: FILE_ID,
      offset: 0,
      length: 1024 * 1024,
    });

    expect(res.isOk() && res.value.data.length).toBe(LARGE_REPLY_BYTES);
  });

  it("returns unimplemented methods as errors instead of throwing", async () => {
    const res = await new DfsClient(transport, SESSION_KEY).stat({
      objectIds: ["root"],
    });

    expect(res.isErr() && res.error.code).toBe("internal");
  });

  it("returns unavailable when the server cannot be reached", async () => {
    const unreachable = new DfsGrpcTransport({
      endpoint: "127.0.0.1:1",
      useTls: false,
      timeoutMs: 500,
    });

    const res = await new DfsClient(unreachable, SESSION_KEY).closeSession();
    unreachable.close();

    expect(res.isErr() && res.error.code).toBe("unavailable");
  });
});
