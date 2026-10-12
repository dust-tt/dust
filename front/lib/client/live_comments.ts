import { onStatelessMessage } from "@app/lib/client/live_session";
import type { DfmComment } from "@app/lib/markdown/dfm";
import type {
  LiveCommentClientMessage,
  LiveCommentCommand,
  LiveCommentErrorCode,
  LiveCommentServerMessage,
} from "@app/types/collab";
import { liveCommentServerMessageSchema } from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { v4 as uuidv4 } from "uuid";

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
 * The channel MUST ask the server for the threads when created and each time the provider syncs
 * again, and MUST report the threads it was created with until the server's arrive. It MUST
 * resolve each command with the server's answer to that command only. A command
 * sent while the provider is not synced, or waiting when its connection closes, MUST resolve as
 * `unavailable`: the provider drops the messages it queued for a lost connection. Once closed the
 * channel MUST NOT report threads, and every command waiting or sent after MUST resolve as
 * `unavailable`, so no caller waits for an answer a lost connection will never bring.
 */
export function createLiveCommentChannel(
  provider: HocuspocusProvider,
  initialThreads: DfmComment[] | null
): LiveCommentChannel {
  let threads = initialThreads;
  let closed = false;
  const listeners = new Set<(comments: DfmComment[]) => void>();
  const pending = new Map<
    string,
    (result: Result<DfmComment | null, LiveCommentErrorCode>) => void
  >();

  const sendMessage = (message: LiveCommentClientMessage) =>
    provider.sendStateless(JSON.stringify(message));
  const requestThreads = () => sendMessage({ type: "threads" });
  const answer = (
    requestId: string,
    result: Result<DfmComment | null, LiveCommentErrorCode>
  ) => {
    const resolve = pending.get(requestId);
    pending.delete(requestId);
    resolve?.(result);
  };
  const failPending = () => {
    pending.forEach((resolve) => resolve(new Err("unavailable")));
    pending.clear();
  };

  const onMessage = (message: LiveCommentServerMessage) => {
    if (closed) {
      return;
    }
    switch (message.type) {
      case "threads": {
        const { comments } = message;
        threads = comments;
        listeners.forEach((listener) => listener(comments));
        return;
      }
      case "accepted":
        answer(message.requestId, new Ok(message.comment));
        return;
      case "refused":
        answer(message.requestId, new Err(message.error));
        return;
    }
  };

  const stopMessages = onStatelessMessage(
    provider,
    liveCommentServerMessageSchema,
    onMessage
  );
  provider.on("synced", requestThreads);
  provider.on("close", failPending);
  requestThreads();

  return {
    getThreads: () => threads,
    onThreads: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send: (command) => {
      if (closed || !provider.isSynced) {
        return Promise.resolve(new Err("unavailable"));
      }
      const requestId = uuidv4();
      return new Promise((resolve) => {
        pending.set(requestId, resolve);
        sendMessage({ type: "command", requestId, command });
      });
    },
    close: () => {
      closed = true;
      threads = null;
      stopMessages();
      provider.off("synced", requestThreads);
      provider.off("close", failPending);
      listeners.clear();
      failPending();
    },
  };
}
