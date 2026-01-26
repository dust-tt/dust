/**
 * React Native compatible Server-Sent Events (SSE) streaming.
 * React Native's fetch doesn't support ReadableStream, so we use
 * XMLHttpRequest for streaming support.
 */

import {
  mapToStreamEvent,
  type StreamEvent,
} from "@app/shared/lib/streaming-types";

import { parseSSEMessages } from "@/lib/sse-parser";

// Heartbeat timeout - abort stream if no data received within this window
const HEARTBEAT_TIMEOUT_MS = 90_000; // 90 seconds
const HEARTBEAT_CHECK_INTERVAL_MS = 10_000; // Check every 10 seconds

export async function* streamAgentAnswerRN(
  dustDomain: string,
  workspaceId: string,
  conversationId: string,
  agentMessageId: string,
  getAccessToken: () => Promise<string | null>,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent, void, unknown> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("No access token");
  }

  const url = `${dustDomain}/api/v1/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${agentMessageId}/events`;

  // Use XMLHttpRequest for streaming support in React Native
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url);
  xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
  xhr.setRequestHeader("Accept", "text/event-stream");
  xhr.setRequestHeader("Cache-Control", "no-cache");

  let buffer = "";
  let lastProcessedIndex = 0;
  let resolveNext: ((value: IteratorResult<StreamEvent, void>) => void) | null =
    null;
  let rejectNext: ((error: Error) => void) | null = null;
  const pendingEvents: StreamEvent[] = [];
  let isDone = false;
  let error: Error | null = null;

  // Heartbeat tracking
  let lastEventTime = Date.now();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Set up heartbeat check
  const checkHeartbeat = () => {
    if (Date.now() - lastEventTime > HEARTBEAT_TIMEOUT_MS) {
      xhr.abort();
      error = new Error("Stream heartbeat timeout");
      isDone = true;
      if (rejectNext) {
        rejectNext(error);
        rejectNext = null;
        resolveNext = null;
      }
    }
  };

  heartbeatTimer = setInterval(checkHeartbeat, HEARTBEAT_CHECK_INTERVAL_MS);

  // Handle abort signal
  if (signal) {
    signal.addEventListener("abort", () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      xhr.abort();
      isDone = true;
      if (resolveNext) {
        resolveNext({ value: undefined, done: true });
      }
    });
  }

  xhr.onprogress = () => {
    // Reset heartbeat timer on any data received
    lastEventTime = Date.now();

    const newData = xhr.responseText.substring(lastProcessedIndex);
    lastProcessedIndex = xhr.responseText.length;
    buffer += newData;

    const messages = parseSSEMessages(buffer);
    // Keep incomplete message in buffer
    const lastNewline = buffer.lastIndexOf("\n\n");
    if (lastNewline !== -1) {
      buffer = buffer.substring(lastNewline + 2);
    }

    for (const msg of messages) {
      if (!msg.data || msg.data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(msg.data);
        // The actual event data is nested inside parsed.data
        const eventData = parsed.data || parsed;
        const event = mapToStreamEvent(eventData);
        if (event) {
          pendingEvents.push(event);
          if (resolveNext) {
            const evt = pendingEvents.shift()!;
            resolveNext({ value: evt, done: false });
            resolveNext = null;
            rejectNext = null;
          }
        }
      } catch {
        // Skip unparseable messages
      }
    }
  };

  xhr.onerror = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    error = new Error("Stream connection error");
    isDone = true;
    if (rejectNext) {
      rejectNext(error);
      rejectNext = null;
      resolveNext = null;
    }
  };

  xhr.onload = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    isDone = true;
    if (resolveNext) {
      resolveNext({ value: undefined, done: true });
      resolveNext = null;
    }
  };

  xhr.send();

  // Async generator that yields events as they arrive
  while (!isDone || pendingEvents.length > 0) {
    if (pendingEvents.length > 0) {
      yield pendingEvents.shift()!;
    } else if (!isDone) {
      // Wait for next event
      const event = await new Promise<IteratorResult<StreamEvent, void>>(
        (resolve, reject) => {
          resolveNext = resolve;
          rejectNext = reject;
        }
      );

      if (event.done) {
        break;
      }
      yield event.value;
    }
  }

  if (error) {
    throw error;
  }
}
