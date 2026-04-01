import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import type {
  AgentMessageEvents,
  ConversationEvents,
} from "@app/lib/api/assistant/streaming/types";
import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import { createCallbackReader } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { makeAgentLoopWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import { cancelAgentLoopSignal } from "@app/temporal/agent_loop/signals";

export async function* getConversationEvents({
  conversationId,
  lastEventId,
  signal,
}: {
  conversationId: string;
  lastEventId: string | null;
  signal: AbortSignal;
}): AsyncGenerator<
  {
    eventId: string;
    data: ConversationEvents;
  },
  void
> {
  const pubsubChannel = getConversationChannelId(conversationId);

  const callbackReader = createCallbackReader<EventPayload | "close">();
  let { history, unsubscribe } = await getRedisHybridManager().subscribe(
    pubsubChannel,
    callbackReader.callback,
    "conversation_events",
    { lastEventId }
  );

  // Unsubscribe if the signal is aborted
  signal.addEventListener("abort", unsubscribe, { once: true });

  try {
    for (const event of history) {
      yield {
        eventId: event.id,
        data: JSON.parse(event.message.payload),
      };
    }
    // Free history entries: V8 retains all locals across `await` in async generators,
    // pinning large event payloads for the entire SSE connection lifetime.
    history = [];

    // As most clients always listen to conversation events, we have a longer timeout to limit the overhead of initiating a new subscription.
    // See https://dust4ai.slack.com/archives/C050SM8NSPK/p1757577149634519
    const TIMEOUT = 180000; // 3 minutes

    // Do not loop forever, we will timeout after some time to avoid blocking the load balancer
    while (true) {
      if (signal.aborted) {
        break;
      }
      const timeoutPromise = new Promise<"timeout">((resolve) => {
        setTimeout(() => {
          resolve("timeout");
        }, TIMEOUT);
      });
      const rawEvent = await Promise.race([
        callbackReader.next(),
        timeoutPromise,
      ]);

      // Determine if we timeouted
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
    logger.error({ error: e }, "Error getting conversation events");
  } finally {
    unsubscribe();
  }
}

export async function cancelMessageGenerationEvent(
  auth: Authenticator,
  {
    messageIds,
    conversationId,
  }: { messageIds: string[]; conversationId: string }
): Promise<void> {
  const client = await getTemporalClientForAgentNamespace();
  const workspaceId = auth.getNonNullableWorkspace().sId;

  await concurrentExecutor(
    messageIds,
    async (messageId) => {
      // We use the message id provided by the caller as the agentMessageId.
      const agentMessageId = messageId;

      const workflowId = makeAgentLoopWorkflowId({
        workspaceId,
        conversationId,
        agentMessageId,
      });
      try {
        const handle = client.workflow.getHandle(workflowId);
        await handle.signal(cancelAgentLoopSignal);
      } catch (signalError) {
        // Swallow errors from signaling (workflow might not exist anymore)
        logger.warn(
          { error: signalError, messageId },
          "Failed to signal agent loop workflow for cancellation"
        );
      }
    },
    { concurrency: 8 }
  );
}

export async function* getMessagesEvents(
  auth: Authenticator,
  {
    messageId,
    lastEventId,
    signal,
  }: { messageId: string; lastEventId: string | null; signal: AbortSignal }
): AsyncGenerator<
  {
    eventId: string;
    data: AgentMessageEvents & {
      step: number;
    };
  },
  void
> {
  const pubsubChannel = getMessageChannelId(messageId);

  const start = Date.now();
  const TIMEOUT = 60000; // 1 minute

  const callbackReader = createCallbackReader<EventPayload | "close">();
  let { history, unsubscribe } = await getRedisHybridManager().subscribe(
    pubsubChannel,
    callbackReader.callback,
    "message_events",
    { lastEventId }
  );

  // Unsubscribe if the signal is aborted
  signal.addEventListener("abort", unsubscribe, { once: true });

  try {
    for (const event of history) {
      yield {
        eventId: event.id,
        data: JSON.parse(event.message.payload),
      };
    }
    // Free history entries: V8 retains all locals across `await` in async generators,
    // pinning large event payloads for the entire SSE connection lifetime.
    history = [];

    // Do not loop forever, we will timeout after some time to avoid blocking the load balancer
    while (Date.now() - start < TIMEOUT) {
      if (signal.aborted) {
        break;
      }

      const rawEvent = await callbackReader.next();

      if (rawEvent === "close") {
        break;
      }

      const event = {
        eventId: rawEvent.id,
        data: JSON.parse(rawEvent.message.payload),
      };

      // If the payload is an end-of-stream event, we stop the generator.
      if (event.data.type === "end-of-stream") {
        break;
      }

      yield event;
    }
  } catch (e) {
    logger.error({ error: e }, "Error getting messages events");
  } finally {
    unsubscribe();
  }
}

function getConversationChannelId(channelId: string) {
  return `conversation-${channelId}`;
}
