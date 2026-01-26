import { EventSourcePolyfill } from "event-source-polyfill";
import { getAccessToken } from "../services/auth";

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 90000;

type SSEStreamOptions = {
  url: string;
  onEvent: (data: unknown) => void;
  onDone: () => void;
  onError: (error: Error) => void;
};

type SSEStreamHandle = {
  close: () => void;
};

const TERMINAL_EVENTS = new Set([
  "agent_message_success",
  "agent_error",
  "agent_generation_cancelled",
  "user_message_error",
]);

export function connectMessageStream(
  options: SSEStreamOptions
): SSEStreamHandle {
  const { url, onEvent, onDone, onError } = options;

  let source: EventSourcePolyfill | null = null;
  let lastEventId: string | null = null;
  let reconnectAttempts = 0;
  let closed = false;

  async function connect() {
    if (closed) return;

    const token = await getAccessToken();
    if (!token) {
      onError(new Error("No access token available"));
      return;
    }

    const streamUrl = lastEventId
      ? `${url}${url.includes("?") ? "&" : "?"}lastEventId=${encodeURIComponent(lastEventId)}`
      : url;

    source = new EventSourcePolyfill(streamUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
    });

    source.onopen = () => {
      reconnectAttempts = 0;
    };

    source.onmessage = (event: { data: string }) => {
      if (closed) return;

      // Server pagination signal — reconnect with fresh token
      if (event.data === "done") {
        source?.close();
        reconnect();
        return;
      }

      try {
        const parsed = JSON.parse(event.data);
        const eventData = parsed.data ?? parsed;
        const eventId = parsed.eventId;

        if (eventId) {
          lastEventId = eventId;
        }

        // Skip server-side control events
        if (eventData.type === "end-of-stream") {
          return;
        }

        onEvent(eventData);

        // Check for terminal events
        if (TERMINAL_EVENTS.has(eventData.type)) {
          source?.close();
          onDone();
        }
      } catch {
        // Skip unparseable events
      }
    };

    source.onerror = () => {
      if (closed) return;
      source?.close();
      reconnect();
    };
  }

  function reconnect() {
    if (closed) return;

    reconnectAttempts++;
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      onError(new Error("Max reconnection attempts reached"));
      return;
    }

    setTimeout(() => {
      if (!closed) {
        connect();
      }
    }, RECONNECT_DELAY_MS);
  }

  function close() {
    closed = true;
    source?.close();
    source = null;
  }

  // Start connection
  connect();

  return { close };
}

export function buildMessageEventsUrl(
  dustDomain: string,
  workspaceId: string,
  conversationId: string,
  messageId: string
): string {
  return `${dustDomain}/api/v1/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/events`;
}
