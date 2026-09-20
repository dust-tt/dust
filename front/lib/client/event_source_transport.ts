// event-source-polyfill's fetch transport ignores the promise returned by reader.cancel().
// A failed stream followed by close() can therefore produce an unhandled rejection. This
// replacement keeps the polyfill's callback interface and settles cancellation failures.

type OnStart = (
  status: number,
  statusText: string,
  contentType: string | null,
  headers: Headers
) => void;

type OnProgress = (chunk: string) => void;
type OnFinish = (error?: unknown) => void;

/**
 * @cc [owner:id13,label:reliability] sse-transport-abort
 * `abort()` MUST abort the fetch, cancel any reader already acquired, and handle a rejection from
 * reader cancellation. Once aborted, the transport MUST NOT call `onFinish`; fetch or read failures
 * observed while active MUST call `onFinish(error)`.
 */
export class ManagedEventSourceTransport {
  open(
    _xhr: unknown,
    onStart: OnStart,
    onProgress: OnProgress,
    onFinish: OnFinish,
    url: string,
    withCredentials: boolean,
    headers: Record<string, string>
  ): { abort: () => void } {
    const controller = new AbortController();
    const decoder = new TextDecoder();
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const consume = async () => {
      try {
        const response = await globalThis.fetch(url, {
          headers,
          credentials: withCredentials ? "include" : "same-origin",
          signal: controller.signal,
          cache: "no-store",
        });
        reader = response.body?.getReader() ?? null;
        onStart(
          response.status,
          response.statusText,
          response.headers.get("Content-Type"),
          response.headers
        );
        if (!reader) {
          throw new Error("EventSource response has no readable body.");
        }

        while (!controller.signal.aborted) {
          const result = await reader.read();
          if (controller.signal.aborted) {
            return;
          }
          if (result.done) {
            onFinish();
            return;
          }
          onProgress(decoder.decode(result.value, { stream: true }));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          onFinish(error);
        }
      }
    };
    void consume();

    return {
      abort: () => {
        controller.abort();
        if (reader) {
          void reader.cancel().catch(() => undefined);
        }
      },
    };
  }
}
