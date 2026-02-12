import type { EventEmitter } from "events";

// This helper turns EventEmitter events into an async generator.
export function fromEvent<T>(
  emitter: EventEmitter,
  eventName: string
): AsyncGenerator<T, void, unknown> {
  let done = false;
  const queue: T[] = [];

  // Resolvers for the pending "next()" call in the async generator.
  let resolveNext: (() => void) | null = null;

  // This function is triggered every time the emitter emits an event.
  const onEvent = (data: T) => {
    queue.push(data);
    // If the consumer is currently waiting, unblock it.
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  };

  // Start listening for events.
  emitter.on(eventName, onEvent);

  const asyncIterator: AsyncGenerator<T, void, unknown> & AsyncDisposable = {
    [Symbol.asyncIterator]() {
      return this;
    },

    async next(): Promise<IteratorResult<T, any>> {
      // If no events are in the queue, and we're not "done", wait for a new one.
      if (!queue.length && !done) {
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
      // If still no events, we might be shutting down. Check for completion.
      if (!queue.length) {
        return { value: undefined, done: true };
      }
      // Otherwise, return the next event from the queue.
      const value = queue.shift() as T;
      return { value, done: false };
    },

    // Called if the consumer breaks out of the generator (e.g., "return").
    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
        async return(): Promise<IteratorResult<T, void>> {
      done = true;
      emitter.off(eventName, onEvent);
      // If a consumer is waiting, unblock it so we can shut down.
      if (resolveNext) {
        resolveNext();
      }
      return { value: undefined, done: true };
    },

    // If the consumer throws from the generator, we just propagate the error.
    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
        async throw(err: any): Promise<IteratorResult<T, void>> {
      return Promise.reject(err);
    },

    async [Symbol.asyncDispose](): Promise<void> {
      await this.return();
    },
  };

  return asyncIterator;
}
