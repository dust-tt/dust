/**
 * SSE (Server-Sent Events) message parsing utilities.
 */

export type SSEMessage = {
  event?: string;
  data: string;
};

/**
 * Parse SSE messages from a chunk of text.
 * Handles multi-line data values and properly extracts event types.
 */
export function parseSSEMessages(chunk: string): SSEMessage[] {
  const messages: SSEMessage[] = [];
  const lines = chunk.split("\n");

  let currentMessage: Partial<SSEMessage> = {};

  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentMessage.event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      const data = line.slice(5).trim();
      if (currentMessage.data) {
        currentMessage.data += "\n" + data;
      } else {
        currentMessage.data = data;
      }
    } else if (line === "" && currentMessage.data) {
      messages.push(currentMessage as SSEMessage);
      currentMessage = {};
    }
  }

  return messages;
}
