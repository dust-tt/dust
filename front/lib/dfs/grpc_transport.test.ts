// @vitest-environment node
import { DfsClient } from "@app/lib/dfs/client";
import { DfsGrpcTransport } from "@app/lib/dfs/grpc_transport";
import type { DfsWireMessage } from "@app/lib/dfs/proto";
import { encodeDfsMessage } from "@app/lib/dfs/proto";
import { getDfsServiceDefinition } from "@app/tests/utils/dfs/dfsServiceDefinition";
import { DfsWireFactory } from "@app/tests/utils/dfs/DfsWireFactory";
import type {
  sendUnaryData,
  ServerUnaryCall,
  UntypedServiceImplementation,
} from "@grpc/grpc-js";
import { Metadata, Server, ServerCredentials, status } from "@grpc/grpc-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT_ID = "0190c3a0b1c27d4e8f0a1b2c3d4e5f60";
const FILE_ID = "0190c3a0b1c37aaa9bbbccccddddeeee";
// The `dfs-response-size` budget, in encoded protobuf payload bytes.
const RESPONSE_BUDGET_BYTES = 4 * 1024 * 1024;
const SESSION_KEY = "k".repeat(64);

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

const LARGE_FILE_ATTR = DfsWireFactory.attr(FILE_ID, {
  name: "large.bin",
  size: "8388608",
});

// A `ReadData` reply whose encoded payload is exactly `encodedBytes` long.
function readDataOfEncodedSize(encodedBytes: number): DfsWireMessage {
  // Measure the overhead with data of the same order of magnitude, so its length varint has the
  // same width as the final one.
  const probe = {
    data: Buffer.alloc(RESPONSE_BUDGET_BYTES),
    object: LARGE_FILE_ATTR,
  };
  const overhead =
    encodeDfsMessage("ReadData", probe).length - RESPONSE_BUDGET_BYTES;
  return {
    data: Buffer.alloc(encodedBytes - overhead, 1),
    object: LARGE_FILE_ATTR,
  };
}

// The fake `Read` replies with the response budget plus `offset` bytes.
function largeReadRequest(offset: number): DfsWireMessage {
  return {
    objectId: DfsWireFactory.objectId(FILE_ID),
    offset: String(offset),
    length: 1024 * 1024,
  };
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
    callback(null, DfsWireFactory.session());
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
          object: DfsWireFactory.attr(ROOT_ID, {
            name: "docs",
            directory: true,
            size: "0",
            mode: 0o700,
            attrVersion: "1",
          }),
        },
      ],
    });
  },
  RevokeSession: (_call: UnaryCall, callback: Callback) => {
    callback(null, {});
  },
  Apply: (call: UnaryCall, callback: Callback) => {
    const expected = {
      operations: [
        {
          create: {
            parentId: DfsWireFactory.objectId(ROOT_ID),
            name: "directory",
            objectId: DfsWireFactory.objectId(FILE_ID),
            kind: "DIRECTORY",
            xattrs: {},
          },
        },
        {
          remove: {
            objectId: DfsWireFactory.objectId(FILE_ID),
            kind: "DIRECTORY",
          },
        },
      ],
    };
    if (!isAuthorized(call)) {
      callback(dfsStatusError(status.UNAUTHENTICATED, "UNAUTHENTICATED"));
      return;
    }
    try {
      expect(call.request).toEqual(expected);
    } catch {
      callback(dfsStatusError(status.INVALID_ARGUMENT, "INVALID_INPUT"));
      return;
    }
    callback(null, {
      results: [{ mutation: { related: [] } }, { mutation: { related: [] } }],
    });
  },
  // Replies with a payload of the response budget plus `offset` bytes.
  Read: (call: UnaryCall, callback: Callback) => {
    const excess = Number(call.request.offset);
    callback(null, readDataOfEncodedSize(RESPONSE_BUDGET_BYTES + excess));
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

  it("encodes directory create and remove using the protocol ObjectKind enum", async () => {
    const client = new DfsClient(transport, SESSION_KEY);
    const response = await client.apply({
      operations: [
        {
          type: "create",
          parentId: ROOT_ID,
          name: "directory",
          objectId: FILE_ID,
          directory: true,
        },
        { type: "remove", objectId: FILE_ID, directory: true },
      ],
    });
    expect(response.isOk()).toBe(true);
    if (response.isOk()) {
      expect(
        response.value.results.every((result) => result.status === "ok")
      ).toBe(true);
    }
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

    const revoked = await client.revokeSession({ sessionId: "session-1" });
    expect(revoked.isOk()).toBe(true);
  });

  it("accepts replies of exactly the response budget", async () => {
    const expected = readDataOfEncodedSize(RESPONSE_BUDGET_BYTES);
    expect(encodeDfsMessage("ReadData", expected).length).toBe(
      RESPONSE_BUDGET_BYTES
    );

    // Through the transport alone: `DfsClient.read` rejects data above 1 MiB.
    const res = await transport.call("Read", largeReadRequest(0), SESSION_KEY);

    expect(res.isOk() && res.value.data).toEqual(expected.data);
  });

  it("rejects replies above the response budget", async () => {
    const res = await transport.call("Read", largeReadRequest(1), SESSION_KEY);

    expect(res.isErr() && res.error.code).toBe("capacity");
  });

  it("returns invalid_input for a key that is not a valid metadata value", async () => {
    const res = await new DfsClient(transport, "bad\nkey").revokeSession({
      sessionId: "session-1",
    });

    expect(res.isErr() && res.error.code).toBe("invalid_input");
  });

  it("returns unimplemented methods as errors instead of throwing", async () => {
    const res = await new DfsClient(transport, SESSION_KEY).stat({
      objectIds: ["root"],
    });

    expect(res.isErr() && res.error.code).toBe("internal");
  });

  it("returns unavailable after the transport is closed", async () => {
    const closed = new DfsGrpcTransport({
      endpoint: "127.0.0.1:1",
      useTls: false,
    });
    closed.close();

    const res = await new DfsClient(closed, SESSION_KEY).revokeSession({
      sessionId: "session-1",
    });

    expect(res.isErr() && res.error.code).toBe("unavailable");
  });

  it("returns unavailable when the server cannot be reached", async () => {
    const unreachable = new DfsGrpcTransport({
      endpoint: "127.0.0.1:1",
      useTls: false,
      timeoutMs: 500,
    });

    const res = await new DfsClient(unreachable, SESSION_KEY).revokeSession({
      sessionId: "session-1",
    });
    unreachable.close();

    expect(res.isErr() && res.error.code).toBe("unavailable");
  });
});
