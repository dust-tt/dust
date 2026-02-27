import type { DustAPI } from "@dust-tt/client";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;
const RECONNECT_DELAY_MS = 5_000;

export class CLIMcpTransport implements Transport {
  private running = false;
  private serverId: string | null = null;
  private lastEventId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  sessionId?: string;

  constructor(
    private readonly dustAPI: DustAPI,
    private readonly onServerIdReceived: (serverId: string) => void,
    private readonly serverName: string = "fs-cli"
  ) {}

  async start(): Promise<void> {
    const registerRes = await this.dustAPI.registerMCPServer({
      serverName: this.serverName,
    });
    if (registerRes.isErr()) {
      throw new Error(
        `Failed to register MCP server: ${registerRes.error.message}`
      );
    }
    this.serverId = registerRes.value.serverId;
    this.onServerIdReceived(this.serverId);

    this.heartbeatTimer = setInterval(async () => {
      if (!this.serverId) {
        return;
      }
      const res = await this.dustAPI.heartbeatMCPServer({
        serverId: this.serverId,
      });
      if (res.isErr() || !res.value.success) {
        const reReg = await this.dustAPI.registerMCPServer({
          serverName: this.serverName,
        });
        if (reReg.isOk()) {
          this.serverId = reReg.value.serverId;
          this.onServerIdReceived(this.serverId);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    this.running = true;
    void this.readLoop();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.serverId) {
      return;
    }
    const res = await this.dustAPI.postMCPResults({
      serverId: this.serverId,
      result: message,
    });
    if (res.isErr()) {
      this.onerror?.(
        new Error(`Failed to send MCP result: ${res.error.message}`)
      );
    }
  }

  async close(): Promise<void> {
    this.running = false;
    this.abortController?.abort();
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.onclose?.();
  }

  private async readLoop(): Promise<void> {
    while (this.running) {
      try {
        const connRes = await this.dustAPI.getMCPRequestsConnectionDetails({
          serverId: this.serverId!,
          lastEventId: this.lastEventId,
        });
        if (connRes.isErr()) {
          throw new Error(
            `Failed to get connection details: ${connRes.error.message}`
          );
        }

        const { url, headers } = connRes.value;
        this.abortController = new AbortController();

        const response = await fetch(url, {
          headers,
          signal: this.abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`SSE request failed: ${response.status}`);
        }
        if (!response.body) {
          throw new Error("No response body");
        }

        for await (const event of parseSSEStream(response.body)) {
          if (!this.running) {
            break;
          }
          if (event.data === "done") {
            continue;
          }

          try {
            const parsed = JSON.parse(event.data);
            if (parsed.eventId) {
              this.lastEventId = parsed.eventId;
            }
            if (parsed.data) {
              this.onmessage?.(parsed.data);
            }
          } catch {}
        }
      } catch {
        if (!this.running) {
          break;
        }
        await sleep(RECONNECT_DELAY_MS);
      }
    }
  }
}

async function* parseSSEStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<{ data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        if (!event.trim()) {
          continue;
        }

        let data = "";
        for (const line of event.split("\n")) {
          if (line.startsWith("data: ")) {
            data += (data ? "\n" : "") + line.slice(6);
          }
        }

        if (data) {
          yield { data };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
