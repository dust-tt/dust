import type { ServiceDefinition } from "@grpc/grpc-js";
import { readFileSync } from "fs";
import path from "path";
import protobuf from "protobufjs";

/** Request and response message types of each `Dfs` RPC. */
export const DFS_METHODS = {
  CreateTenant: { request: "CreateTenantRequest", response: "Tenant" },
  CreateSession: { request: "CreateSessionRequest", response: "Session" },
  CurrentSession: { request: "Empty", response: "Session" },
  CloseSession: { request: "Empty", response: "Empty" },
  ListGrants: { request: "ListGrantsRequest", response: "GrantPage" },
  UpdateGrants: { request: "UpdateGrantsRequest", response: "Empty" },
  Stat: { request: "StatRequest", response: "AttrBatch" },
  Lookup: { request: "LookupRequest", response: "AttrBatch" },
  List: { request: "ListRequest", response: "EntryPage" },
  Read: { request: "ReadRequest", response: "ReadData" },
  ReadFiles: { request: "ReadFilesRequest", response: "FilesBatch" },
  Validate: { request: "ValidateRequest", response: "ValidationBatch" },
  Apply: { request: "ApplyRequest", response: "OperationBatch" },
  Search: { request: "SearchRequest", response: "SearchResults" },
} as const;

export type DfsMethod = keyof typeof DFS_METHODS;

/**
 * Plain-object representation of a protobuf message, as produced by `decodeDfsMessage` and accepted
 * by `encodeDfsMessage`. Field names are camelCase, 64-bit integers are decimal strings, enums are
 * their value names and bytes are `Uint8Array`.
 */
export type DfsWireMessage = { [key: string]: unknown };

const WIRE_CONVERSION_OPTIONS: protobuf.IConversionOptions = {
  longs: String,
  enums: String,
  arrays: true,
  objects: true,
};

const DFS_PROTO_PACKAGE = "dfs.v1";

// The server's protocol definition (`dfs/protocol/proto/dfs.proto`), read from the repository
// rather than copied into front.
function loadDfsRoot(): protobuf.Root {
  const protoPath = path.resolve(
    path.dirname(require.resolve("@dust-tt/front/lib/dfs/proto.ts")),
    "../../../dfs/protocol/proto/dfs.proto"
  );
  return protobuf.parse(readFileSync(protoPath, "utf8")).root;
}

let dfsRoot: protobuf.Root | null = null;

function getDfsType(name: string): protobuf.Type {
  if (!dfsRoot) {
    dfsRoot = loadDfsRoot();
  }
  return dfsRoot.lookupType(`${DFS_PROTO_PACKAGE}.${name}`);
}

/** Throws if `message` does not match the protobuf type `typeName`. */
export function encodeDfsMessage(
  typeName: string,
  message: DfsWireMessage
): Buffer {
  const type = getDfsType(typeName);
  return Buffer.from(type.encode(type.fromObject(message)).finish());
}

/** Throws if `buffer` is not a valid encoding of the protobuf type `typeName`. */
export function decodeDfsMessage(
  typeName: string,
  buffer: Uint8Array
): DfsWireMessage {
  const type = getDfsType(typeName);
  return type.toObject(type.decode(buffer), WIRE_CONVERSION_OPTIONS);
}

export function dfsMethodPath(method: DfsMethod): string {
  return `/${DFS_PROTO_PACKAGE}.Dfs/${method}`;
}

/** gRPC service definition of `Dfs`, usable to build a client or a (test) server. */
export function getDfsServiceDefinition(): ServiceDefinition {
  return Object.fromEntries(
    Object.entries(DFS_METHODS).map(([method, { request, response }]) => [
      method,
      {
        path: `/${DFS_PROTO_PACKAGE}.Dfs/${method}`,
        requestStream: false,
        responseStream: false,
        requestSerialize: (message: DfsWireMessage) =>
          encodeDfsMessage(request, message),
        requestDeserialize: (buffer: Buffer) =>
          decodeDfsMessage(request, buffer),
        responseSerialize: (message: DfsWireMessage) =>
          encodeDfsMessage(response, message),
        responseDeserialize: (buffer: Buffer) =>
          decodeDfsMessage(response, buffer),
      },
    ])
  );
}
