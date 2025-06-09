import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { createCallbackReader } from "@app/lib/utils";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";

export const MCP_EVENT_TIMEOUT = 3 * 60 * 1000; // 3 minutes.

export async function* getMCPEvents({
  actionId,
}: {
  actionId: string;
}): AsyncGenerator<
  {
    eventId: string;
    data: {
      type: MCPValidationOutputType;
      created: number;
      actionId: string;
      messageId?: string;
    };
  },
  void
> {
  const pubSubChannel = getMCPChannelId(actionId);

  const reader = createCallbackReader<EventPayload | "close">();
  const { history, unsubscribe } = await getRedisHybridManager().subscribe(
    pubSubChannel,
    reader.callback,
    null,
    "action_events"
  );

  for (const event of history) {
    yield {
      eventId: event.id,
      data: JSON.parse(event.message.payload),
    };
  }

  try {
    while (true) {
      const rawEvent = await Promise.race([
        reader.next(),
        setTimeoutAsync(MCP_EVENT_TIMEOUT),
      ]);

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
    logger.error({ error: e }, "Error getting action events");
  } finally {
    unsubscribe();
  }
}

function getMCPChannelId(actionId: string) {
  return `action-${actionId}`;
}
