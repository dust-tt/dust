import { dfsErrorCodeFromWire } from "@app/lib/dfs/codec";
import type { DfsMethod, DfsWireMessage } from "@app/lib/dfs/proto";
import {
  DFS_METHODS,
  decodeDfsMessage,
  dfsMethodPath,
  encodeDfsMessage,
} from "@app/lib/dfs/proto";
import type { DfsTransport } from "@app/lib/dfs/transport";
import type { DfsErrorCode } from "@app/types/dfs";
import { DfsError } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { ServiceError } from "@grpc/grpc-js";
import { Client, credentials, Metadata, status } from "@grpc/grpc-js";

const DEFAULT_DFS_TIMEOUT_MS = 30_000;
// The `dfs-response-size` budget: 4 MiB of protobuf payload, framing excluded, which is what
// grpc-js measures.
const MAX_RECEIVE_MESSAGE_BYTES = 4 * 1024 * 1024;
const ERROR_DETAILS_METADATA_KEY = "grpc-status-details-bin";

function identity(buffer: Buffer): Buffer {
  return buffer;
}

// Used when the server attached no `ErrorDetails` (e.g. failures outside the dfs handlers).
function dfsErrorCodeFromGrpcStatus(code: status): DfsErrorCode {
  switch (code) {
    case status.UNAUTHENTICATED:
      return "unauthenticated";
    case status.PERMISSION_DENIED:
      return "forbidden";
    case status.UNAVAILABLE:
    case status.DEADLINE_EXCEEDED:
    case status.CANCELLED:
      return "unavailable";
    case status.RESOURCE_EXHAUSTED:
      return "capacity";
    default:
      return "internal";
  }
}

function dfsErrorFromServiceError(error: ServiceError): DfsError {
  const [details] = error.metadata?.get(ERROR_DETAILS_METADATA_KEY) ?? [];
  if (details instanceof Buffer) {
    try {
      const { code } = decodeDfsMessage("ErrorDetails", details);
      if (typeof code === "string") {
        return new DfsError(dfsErrorCodeFromWire(code), error.details);
      }
    } catch {
      // Undecodable details: fall back to the gRPC status code.
    }
  }
  return new DfsError(dfsErrorCodeFromGrpcStatus(error.code), error.details);
}

export interface DfsGrpcTransportOptions {
  // `host:port` of the dfs server.
  endpoint: string;
  useTls: boolean;
  timeoutMs?: number;
}

/** `DfsTransport` over gRPC. One instance holds one channel; call `close` when done. */
export class DfsGrpcTransport implements DfsTransport {
  private readonly client: Client;
  private readonly timeoutMs: number;

  constructor({ endpoint, useTls, timeoutMs }: DfsGrpcTransportOptions) {
    this.client = new Client(
      endpoint,
      useTls ? credentials.createSsl() : credentials.createInsecure(),
      { "grpc.max_receive_message_length": MAX_RECEIVE_MESSAGE_BYTES }
    );
    this.timeoutMs = timeoutMs ?? DEFAULT_DFS_TIMEOUT_MS;
  }

  async call(
    method: DfsMethod,
    request: DfsWireMessage,
    key: string
  ): Promise<Result<DfsWireMessage, DfsError>> {
    const { request: requestType, response: responseType } =
      DFS_METHODS[method];

    let encoded: Buffer;
    try {
      encoded = encodeDfsMessage(requestType, request);
    } catch (err) {
      return new Err(
        new DfsError("invalid_input", normalizeError(err).message)
      );
    }

    const metadata = new Metadata();
    try {
      metadata.set("authorization", `Bearer ${key}`);
    } catch {
      // grpc-js rejects values outside printable ASCII; the key itself is not echoed back.
      return new Err(
        new DfsError("invalid_input", "Key is not a valid metadata value.")
      );
    }

    // Responses are decoded here rather than by grpc-js so that malformed messages surface as
    // `invalid_response` instead of a generic gRPC internal error.
    const response = await new Promise<Result<Buffer, DfsError>>((resolve) => {
      this.client.makeUnaryRequest(
        dfsMethodPath(method),
        identity,
        identity,
        encoded,
        metadata,
        { deadline: Date.now() + this.timeoutMs },
        (error, value) => {
          if (error) {
            resolve(new Err(dfsErrorFromServiceError(error)));
          } else if (!value) {
            resolve(new Err(new DfsError("invalid_response", "No response.")));
          } else {
            resolve(new Ok(value));
          }
        }
      );
    });
    if (response.isErr()) {
      return response;
    }

    try {
      return new Ok(decodeDfsMessage(responseType, response.value));
    } catch (err) {
      return new Err(
        new DfsError("invalid_response", normalizeError(err).message)
      );
    }
  }

  close(): void {
    this.client.close();
  }
}
