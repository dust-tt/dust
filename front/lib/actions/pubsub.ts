import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { createCallbackPromise } from "@app/lib/utils";
import logger from "@app/logger/logger";

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
      const timeoutPromise = new Promise<"timeout">((resolve) => {
        setTimeout(() => {
          resolve("timeout");
        }, 180000); // 3 minutes
      });
      const rawEvent = await Promise.race([
        callbackPromise.promise,
        timeoutPromise,
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
