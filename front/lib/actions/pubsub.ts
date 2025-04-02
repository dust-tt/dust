import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { createCallbackPromise } from "@app/lib/utils";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";

export const MCP_EVENT_TIMEOUT = 3 * 60 * 1000; // 3 minutes.

export async function* getMCPEvents({
  actionId,
}: {
  actionId: number;
}): AsyncGenerator<
  {
    eventId: string;
    data: {
      type: "action_approved" | "action_rejected";
      created: number;
      actionId: number;
      messageId?: string;
      paramsHash?: string;
    };
  },
  void
> {
  const pubsubChannel = getMCPChannelid(actionId);

  const callbackPromise = createCallbackPromise<EventPayload | "close">();
  const { history, unsubscribe } = await getRedisHybridManager().subscribe(
    pubsubChannel,
    callbackPromise.callback,
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
        callbackPromise.promise,
        await setTimeoutAsync(MCP_EVENT_TIMEOUT),
      ]);

      if (rawEvent === "timeout") {
        break;
      }

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
    logger.error({ error: e }, "Error getting action events");
  } finally {
    unsubscribe();
  }
}

function getMCPChannelid(actionId: number) {
  return `action-${actionId}`;
}
