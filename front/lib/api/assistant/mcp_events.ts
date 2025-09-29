import {
  getMCPServerChannelId,
  getMCPServerResultsChannelId,
  isMCPEventResult,
} from "@app/lib/api/actions/mcp_client_side";
import { publishEvent } from "@app/lib/api/assistant/streaming/events";
import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { createCallbackReader } from "@app/lib/utils";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";

interface GetMCPEventsForServerOptions {
  mcpServerId: string;
  lastEventId?: string;
}

const MCP_EVENTS_TIMEOUT = 1 * 60 * 1000; // 1 minute.

export async function* getMCPEventsForServer(
  auth: Authenticator,
  { mcpServerId, lastEventId }: GetMCPEventsForServerOptions,
  signal: AbortSignal
) {
  const channelId = getMCPServerChannelId(auth, { mcpServerId });

  const callbackReader = createCallbackReader<EventPayload | "close">();
  const { history, unsubscribe } = await getRedisHybridManager().subscribe(
    channelId,
    callbackReader.callback,
    lastEventId,
    "mcp_events"
  );

  // Unsubscribe if the signal is aborted.
  signal.addEventListener("abort", unsubscribe, { once: true });

  // Yield the history based on the lastEventId.
  for (const event of history) {
    yield {
      eventId: event.id,
      data: JSON.parse(event.message.payload),
    };
  }

  try {
    // Do not loop forever, we will timeout after some time to avoid blocking the load balancer.
    while (true) {
      if (signal.aborted) {
        break;
      }
      const rawEvent = await Promise.race([
        callbackReader.next(),
        setTimeoutAsync(MCP_EVENTS_TIMEOUT),
      ]);

      // Determine if we timeouted.
      if (rawEvent === "timeout") {
        break;
      }

      if (rawEvent === "close") {
        break;
      }

      const event = {
        eventId: rawEvent.id,
        data: JSON.parse(rawEvent.message.payload),
      };

      yield event;
    }
  } catch (e) {
    logger.error({ error: e }, "Error getting conversation MCP events");
  } finally {
    unsubscribe();
  }
}

export async function publishMCPResults(
  auth: Authenticator,
  {
    mcpServerId,
    result,
  }: {
    mcpServerId: string;
    result?: unknown;
  }
) {
  // Publish MCP action results.
  await publishEvent({
    origin: "mcp_client_side_results",
    channel: getMCPServerResultsChannelId(auth, {
      mcpServerId,
    }),
    event: JSON.stringify({
      type: "mcp_client_side_results",
      result,
    }),
  });

  // Remove the event from the action channel once we have published the results.
  await getRedisHybridManager().removeEvent(
    (event) => {
      const payload = JSON.parse(event.message["payload"]);

      if (
        "id" in payload &&
        isMCPEventResult(result) &&
        payload.id === result.id
      ) {
        return true;
      }

      // If it's a notification (no id, then let's drop it).
      return true;
    },
    getMCPServerChannelId(auth, { mcpServerId })
  );
}
