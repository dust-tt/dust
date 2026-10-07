import type { DfmComment } from "@app/lib/markdown/dfm";
import type {
  LiveCommentClientMessage,
  LiveCommentCommand,
  LiveCommentErrorCode,
} from "@app/types/collab";
import { liveCommentServerMessageSchema } from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import type { HocuspocusProvider } from "@hocuspocus/provider";

/** The comment side of a live connection. */
export interface LiveCommentChannel {
  getThreads: () => DfmComment[] | null;
  onThreads: (listener: (comments: DfmComment[]) => void) => () => void;
  send: (
    command: LiveCommentCommand
  ) => Promise<Result<DfmComment | null, LiveCommentErrorCode>>;
  close: () => void;
}

/**
 * @cc [owner:tdraier,label:product] live-comment-channel
 * The channel MUST ask the server for the threads when created, and MUST resolve each command
 * with the server's answer to that command only. Once closed it MUST NOT report threads, and
 * every command waiting or sent after MUST resolve as `unavailable`, so no caller waits for an
 * answer a lost connection will never bring.
 */
export function createLiveCommentChannel(
  provider: HocuspocusProvider
): LiveCommentChannel {
  let threads: DfmComment[] | null = null;
  let closed = false;
  const listeners = new Set<(comments: DfmComment[]) => void>();
  const pending = new Map<
    string,
    (result: Result<DfmComment | null, LiveCommentErrorCode>) => void
  >();

  const sendMessage = (message: LiveCommentClientMessage) =>
    provider.sendStateless(JSON.stringify(message));

  const onStateless = ({ payload }: { payload: string }) => {
    const json = safeParseJSON(payload);
    const message = json.isOk()
      ? liveCommentServerMessageSchema.safeParse(json.value)
      : null;
    if (closed || !message?.success) {
      return;
    }
    switch (message.data.type) {
      case "threads": {
        const { comments } = message.data;
        threads = comments;
        listeners.forEach((listener) => listener(comments));
        return;
      }
      case "result": {
        const { requestId, error, comment } = message.data;
        const resolve = pending.get(requestId);
        pending.delete(requestId);
        resolve?.(error === null ? new Ok(comment) : new Err(error));
        return;
      }
    }
  };

  provider.on("stateless", onStateless);
  sendMessage({ type: "threads" });

  return {
    getThreads: () => threads,
    onThreads: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send: (command) => {
      if (closed) {
        return Promise.resolve(new Err("unavailable"));
      }
      // TODO(co-edition): `crypto.randomUUID` only exists in secure contexts, so this throws over
      // plain HTTP on a host other than localhost.
      const requestId = crypto.randomUUID();
      return new Promise((resolve) => {
        pending.set(requestId, resolve);
        sendMessage({ type: "command", requestId, command });
      });
    },
    close: () => {
      closed = true;
      threads = null;
      provider.off("stateless", onStateless);
      listeners.clear();
      pending.forEach((resolve) => resolve(new Err("unavailable")));
      pending.clear();
    },
  };
}
