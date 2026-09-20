type OnStart = (
  status: number,
  statusText: string,
  contentType: string | null,
  headers: Headers
) => void;

type OnProgress = (chunk: string) => void;
type OnFinish = (error?: unknown) => void;

/**
 * @cc [owner:id13,label:reliability] settle-sse-reader-cancellation
 * `abort()` MUST abort the fetch and cancel an acquired response reader while handling any
 * rejection from reader cancellation.
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
