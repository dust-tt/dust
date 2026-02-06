import type { DustAPI } from "../index";
import type { RetryOptions } from "./retry";
import { DEFAULT_RETRY_OPTIONS, withRetry } from "./retry";
import { MessageStreamImpl } from "./stream";
import type {
  AgentResponse,
  DustAPIOptions,
  MessageStream,
  SendMessageOptions,
  SendMessageParams,
  StreamMessageParams,
} from "./types";

export class AgentsAPI {
  private _client: DustAPI;
  private _retryOptions: RetryOptions;
  private _autoApproveTools: boolean;

  constructor(client: DustAPI, options?: Partial<DustAPIOptions>) {
    this._client = client;
    this._retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options?.retry };
    this._autoApproveTools = options?.autoApproveTools ?? false;
  }

  async sendMessage(
    params: SendMessageParams,
    options?: SendMessageOptions
  ): Promise<AgentResponse> {
    const retryOptions: Partial<RetryOptions> = {};
    if (options?.maxRetries !== undefined) {
      retryOptions.maxAttempts = options.maxRetries + 1;
    }

    return withRetry(
      async () => {
        const stream = this.streamMessage(params);
        return stream.finalMessage();
      },
      { ...this._retryOptions, ...retryOptions, signal: params.signal }
    );
  }

  streamMessage(params: StreamMessageParams): MessageStream {
    return new MessageStreamImpl(this._client, params, this._autoApproveTools);
  }
}
