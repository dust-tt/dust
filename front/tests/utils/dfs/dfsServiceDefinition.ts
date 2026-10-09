import {
  DFS_METHODS,
  decodeDfsMessage,
  dfsMethodPath,
  encodeDfsMessage,
} from "@app/lib/dfs/proto";
import type { DfsMethod, DfsWireMessage } from "@app/lib/dfs/proto";
import type { ServiceDefinition } from "@grpc/grpc-js";

function isDfsMethod(method: string): method is DfsMethod {
  return method in DFS_METHODS;
}

/** gRPC service definition of `Dfs`, to run an in-process fake dfs server in tests. */
export function getDfsServiceDefinition(): ServiceDefinition {
  return Object.fromEntries(
    Object.keys(DFS_METHODS)
      .filter(isDfsMethod)
      .map((method) => {
        const { request, response } = DFS_METHODS[method];
        return [
          method,
          {
            path: dfsMethodPath(method),
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
        ];
      })
  );
}
