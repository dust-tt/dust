import type { DfsMethod, DfsWireMessage } from "@app/lib/dfs/proto";
import type { DfsError } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";

/**
 * Carries one unary `Dfs` RPC. Requests and responses are wire messages (see `DfsWireMessage`);
 * `DfsClient` owns their encoding from and decoding to the domain types.
 */
export interface DfsTransport {
  /**
   * @cc [owner:fabiencelier,label:error-handling] transport-errors-as-results
   * RPC failures (server errors, network errors, deadlines, undecodable messages) MUST be returned
   * as `Err(DfsError)` and MUST NOT be thrown. When the server attached `ErrorDetails`, the
   * `DfsError` code MUST be the one from those details.
   */
  /**
   * @cc [owner:fabiencelier,label:security] key-as-bearer-metadata
   * `key` MUST only be sent as the `authorization: Bearer <key>` request metadata and MUST NOT be
   * logged.
   */
  call(
    method: DfsMethod,
    request: DfsWireMessage,
    key: string
  ): Promise<Result<DfsWireMessage, DfsError>>;
}
