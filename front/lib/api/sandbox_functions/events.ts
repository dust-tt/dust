import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { createCallbackReader } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type { SandboxFunctionInvocationEvent } from "@app/types/api/sandbox_functions";

const SANDBOX_FUNCTION_INVOCATION_EVENTS_ORIGIN =
  "sandbox_function_invocation_events" as const;

export type SandboxFunctionInvocationStreamEvent = {
  eventId: string;
  data: SandboxFunctionInvocationEvent;
};

export function getSandboxFunctionInvocationChannelId({
  invocationId,
}: {
  invocationId: string;
}): string {
  return `sandbox-function-invocation-${invocationId}`;
}

export async function publishSandboxFunctionInvocationEvent(
  event: SandboxFunctionInvocationEvent,
  {
    invocationId,
  }: {
    invocationId: string;
  }
): Promise<void> {
  await getRedisHybridManager().publish(
    getSandboxFunctionInvocationChannelId({ invocationId }),
    JSON.stringify(event),
    SANDBOX_FUNCTION_INVOCATION_EVENTS_ORIGIN
  );
}

export async function* getSandboxFunctionInvocationEvents({
  invocationId,
  lastEventId,
  signal,
}: {
  invocationId: string;
  lastEventId: string | null;
  signal: AbortSignal;
}): AsyncGenerator<SandboxFunctionInvocationStreamEvent, void> {
  const callbackReader = createCallbackReader<EventPayload | "close">();
  let { history, unsubscribe } = await getRedisHybridManager().subscribe(
    getSandboxFunctionInvocationChannelId({ invocationId }),
    callbackReader.callback,
    SANDBOX_FUNCTION_INVOCATION_EVENTS_ORIGIN,
    { lastEventId }
  );

  signal.addEventListener("abort", unsubscribe, { once: true });

  try {
    for (const rawEvent of history) {
      const event = parseSandboxFunctionInvocationEvent(rawEvent);
      yield event;
      if (event.data.type === "sandbox_function_invocation_result") {
        return;
      }
    }
    history = [];

    const timeoutMs = 60000;
    while (!signal.aborted) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<"timeout">((resolve) => {
        timeoutId = setTimeout(() => resolve("timeout"), timeoutMs);
      });
      const rawEvent = await Promise.race([
        callbackReader.next(),
        timeoutPromise,
      ]);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      if (rawEvent === "timeout" || rawEvent === "close") {
        break;
      }

      const event = parseSandboxFunctionInvocationEvent(rawEvent);
      yield event;
      if (event.data.type === "sandbox_function_invocation_result") {
        break;
      }
    }
  } catch (error) {
    logger.error({ error }, "Error getting sandbox function invocation events");
  } finally {
    signal.removeEventListener("abort", unsubscribe);
    unsubscribe();
  }
}

function parseSandboxFunctionInvocationEvent(
  rawEvent: EventPayload
): SandboxFunctionInvocationStreamEvent {
  return {
    eventId: rawEvent.id,
    data: JSON.parse(rawEvent.message.payload),
  };
}
