import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  JSONRPCMessage,
  RequestId,
} from "@modelcontextprotocol/sdk/types.js";

interface QueuedMessage {
  message: JSONRPCMessage;
  extra?: { authInfo?: AuthInfo };
}

/**
 * In-memory transport for creating clients and servers that talk to each other within the same process.
 */
export class InMemoryWithAuthTransport implements Transport {
  private _otherTransport?: InMemoryWithAuthTransport;
  private _messageQueue: QueuedMessage[] = [];
  private _authInfo?: AuthInfo;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (
    message: JSONRPCMessage,
    extra?: { authInfo?: AuthInfo }
  ) => void;
  sessionId?: string;

  /**
   * Creates a pair of linked in-memory transports that can communicate with each other. One should be passed to a Client and one to a Server.
   */
  static createLinkedPair(): [
    InMemoryWithAuthTransport,
    InMemoryWithAuthTransport,
  ] {
    const clientTransport = new InMemoryWithAuthTransport();
    const serverTransport = new InMemoryWithAuthTransport();
    clientTransport._otherTransport = serverTransport;
    serverTransport._otherTransport = clientTransport;

    return [clientTransport, serverTransport];
  }

  public setAuthInfo(authInfo: AuthInfo): void {
    this._authInfo = authInfo;
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async start(): Promise<void> {
    // Process any messages that were queued before start was called
    while (this._messageQueue.length > 0) {
      const queuedMessage = this._messageQueue.shift()!;
      this.onmessage?.(queuedMessage.message, queuedMessage.extra);
    }
  }

  async close(): Promise<void> {
    const other = this._otherTransport;
    this._otherTransport = undefined;
    await other?.close();
    this.onclose?.();
  }

  /**
   * Sends a message with optional auth info.
   * This is useful for testing authentication scenarios.
   */
  
// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
async  send(
    message: JSONRPCMessage,
    options?: { relatedRequestId?: RequestId; authInfo?: AuthInfo }
  ): Promise<void> {
    if (!this._otherTransport) {
      throw new Error("Not connected");
    }

    if (this._otherTransport.onmessage) {
      this._otherTransport.onmessage(message, {
        authInfo: options?.authInfo ?? this._authInfo,
      });
    } else {
      this._otherTransport._messageQueue.push({
        message,
        extra: { authInfo: options?.authInfo ?? this._authInfo },
      });
    }
  }
}
