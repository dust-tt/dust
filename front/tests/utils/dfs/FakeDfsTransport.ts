import type { DfsMethod, DfsWireMessage } from "@app/lib/dfs/proto";
import {
  DFS_METHODS,
  decodeDfsMessage,
  encodeDfsMessage,
} from "@app/lib/dfs/proto";
import type { DfsTransport } from "@app/lib/dfs/transport";
import type { DfsError } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

export type FakeDfsAnswer = Result<DfsWireMessage, DfsError>;

/**
 * Fake transport answering with canned wire responses. Requests and answers go through the real
 * protobuf encoding so that field names and types are checked against `dfs.proto`.
 */
export class FakeDfsTransport implements DfsTransport {
  readonly calls: {
    method: DfsMethod;
    request: DfsWireMessage;
    key: string;
  }[] = [];

  constructor(
    private readonly answers: Partial<Record<DfsMethod, FakeDfsAnswer>>
  ) {}

  async call(
    method: DfsMethod,
    request: DfsWireMessage,
    key: string
  ): Promise<FakeDfsAnswer> {
    const types = DFS_METHODS[method];
    this.calls.push({
      method,
      request: decodeDfsMessage(
        types.request,
        encodeDfsMessage(types.request, request)
      ),
      key,
    });
    const answer = this.answers[method];
    if (!answer) {
      throw new Error(`Unexpected call to ${method}`);
    }
    if (answer.isErr()) {
      return answer;
    }
    return new Ok(
      decodeDfsMessage(
        types.response,
        encodeDfsMessage(types.response, answer.value)
      )
    );
  }
}
