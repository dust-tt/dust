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

  // Handle abort signal
  if (signal) {
    signal.addEventListener("abort", () => {
      xhr.abort();
      isDone = true;
      if (resolveNext) {
        resolveNext({ value: undefined, done: true });
      }
    });
  }

  xhr.onprogress = () => {
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
    error = new Error("Stream connection error");
    isDone = true;
    if (rejectNext) {
      rejectNext(error);
      rejectNext = null;
      resolveNext = null;
    }
  };

  xhr.onload = () => {
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
