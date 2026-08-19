import type {
  ErrorEvent,
  ModelResponseEvent,
} from "@app/lib/model_constructors/types/output/events";

/**
 * Keeps the first provider error until the normalized stream is exhausted.
 *
 * Some providers report usage in the same raw event as a failure or in a
 * trailing event. Delaying the error lets the shared lifecycle consume and
 * persist that usage before downstream consumers stop at the terminal event.
 */
export async function* deferTerminalError(
  events: AsyncGenerator<ModelResponseEvent>
): AsyncGenerator<ModelResponseEvent> {
  let terminalError: ErrorEvent | null = null;

  for await (const event of events) {
    if (event.type === "error") {
      terminalError ??= event;
      continue;
    }
    if (terminalError && event.type === "success") {
      continue;
    }
    yield event;
  }

  if (terminalError) {
    yield terminalError;
  }
}
