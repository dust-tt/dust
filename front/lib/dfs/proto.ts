import { readFileSync } from "fs";
import path from "path";
import protobuf from "protobufjs";

/** Request and response message types of each `Dfs` RPC. */
export const DFS_METHODS = {
  CreateTenant: { request: "CreateTenantRequest", response: "Tenant" },
  CreateSession: { request: "CreateSessionRequest", response: "Session" },
  RevokeSession: { request: "RevokeSessionRequest", response: "Empty" },
  CurrentSession: { request: "Empty", response: "Session" },
  RefreshSession: { request: "Empty", response: "Session" },
  ListGrants: { request: "ListGrantsRequest", response: "GrantPage" },
  UpdateGrants: { request: "UpdateGrantsRequest", response: "Empty" },
  Stat: { request: "StatRequest", response: "AttrBatch" },
  Lookup: { request: "LookupRequest", response: "AttrBatch" },
  List: { request: "ListRequest", response: "EntryPage" },
  Read: { request: "ReadRequest", response: "ReadData" },
  ReadFiles: { request: "ReadFilesRequest", response: "FilesBatch" },
  Lock: { request: "LockRequest", response: "LockState" },
  Unlock: { request: "ObjectLock", response: "Empty" },
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

/**
 * The server's protocol definition (`dfs/protocol/proto/dfs.proto`), read from the repository
 * rather than copied into front.
 */
/**
 * @cc [owner:fabiencelier,label:architecture] dfs-proto-resolvable
 * The proto MUST be resolved relative to front's `package.json`, at `../dfs/protocol/proto`, and
 * MUST stay resolvable from the front-api and workers images: `dockerfiles/front.Dockerfile` copies
 * `dfs/protocol/proto` next to `front` in both.
 */
function loadDfsRoot(): protobuf.Root {
  // Package resolution works in both source and bundled entry points; `package.json` is the one
  // file of front that every image keeps.
  const protoPath = path.resolve(
    path.dirname(require.resolve("@dust-tt/front/package.json")),
    "../dfs/protocol/proto/dfs.proto"
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
