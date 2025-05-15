import {
  getMCPServerChannelId,
  getMCPServerResultsChannelId,
  isClientSideMCPPayload,
} from "@app/lib/api/actions/mcp_client_side";
import { publishEvent } from "@app/lib/api/assistant/pubsub";
import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { createCallbackPromise } from "@app/lib/utils";
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

  const callbackPromise = createCallbackPromise<EventPayload | "close">();
  const { history, unsubscribe } = await getRedisHybridManager().subscribe(
    channelId,
    callbackPromise.callback,
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
        callbackPromise.promise,
        setTimeoutAsync(MCP_EVENTS_TIMEOUT),
      ]);

      // Determine if we timeouted.
      if (rawEvent === "timeout") {
        break;
      }

      // Reset the promise for the next event.
      callbackPromise.reset();

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

export async function publicMCPResults(
  auth: Authenticator,
  {
    mcpServerId,
    messageId,
    requestId,
    result,
  }: {
    mcpServerId: string;
    messageId: string;
    requestId: string;
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
      messageId,
      result,
    }),
  });

  // Remove the event from the action channel once we have published the results.
  await getRedisHybridManager().removeEvent(
    (event) => {
      const payload = JSON.parse(event.message["payload"]);

      if (isClientSideMCPPayload(payload)) {
        return payload.requestId === requestId;
      }

      return false;
    },
    getMCPServerChannelId(auth, { mcpServerId })
  );
}
