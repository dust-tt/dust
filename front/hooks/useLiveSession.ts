import type {
  DocumentLiveSession,
  LiveStatus,
} from "@app/components/editor/document/types";
import type { LiveCommentChannel } from "@app/lib/client/live_comments";
import { createLiveCommentChannel } from "@app/lib/client/live_comments";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";

/** A shared document synced with the server, and the connection that keeps it in sync. */
export interface LiveConnection {
  /** Unique per connection: an editor bound to one never outlives it. */
  id: number;
  document: Y.Doc;
  provider: HocuspocusProvider;
  comments: LiveCommentChannel;
  close: () => void;
}

let nextConnectionId = 0;

const RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * @cc [owner:PopDaph,label:product] document-live-reconnect
 * A shared document MUST be shown only once it has synced with the server. After a disconnect,
 * or the server closing the document, its connection MUST NOT reconnect: the server may hold
 * another copy of the document by then, and merging the old one into it would duplicate the
 * content. A fresh document and connection MUST take over, and the old document stays on
 * screen, read-only, until the new one has synced. The fresh connection's comments MUST start
 * from the threads last received by an earlier connection to the same document and user, if any.
 * Joining another document, or as another user, MUST close the current connection at once.
 */
export function useLiveSession(live: DocumentLiveSession | undefined): {
  connection: LiveConnection | null;
  status: LiveStatus;
  /** The shown connection has changes the server has not confirmed yet. */
  syncing: boolean;
} {
  const [connection, setConnection] = useState<LiveConnection | null>(null);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [syncing, setSyncing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const shownRef = useRef<LiveConnection | null>(null);
  // Losses since the last sync: the delay doubles with each, so a down server is not hammered.
  const failuresRef = useRef(0);
  // TODO(co-edition): the threads also live in the channel and the editor; one store per session,
  // outliving its connections, would replace this copy taken before each close.
  const lastThreadsRef = useRef<DfmComment[] | null>(null);

  const url = live?.url;
  const documentName = live?.documentName;
  const userId = live?.user.id;
  const getTicket = live?.getTicket;

  // Another document or user: what is shown belongs to the previous one.
  useEffect(
    () => () => {
      shownRef.current?.close();
      shownRef.current = null;
      failuresRef.current = 0;
      lastThreadsRef.current = null;
      setConnection(null);
      setStatus("connecting");
      setSyncing(false);
    },
    [url, documentName, userId, getTicket]
  );

  useEffect(() => {
    if (
      url === undefined ||
      documentName === undefined ||
      getTicket === undefined
    ) {
      return;
    }
    const document = new Y.Doc();
    let synced = false;
    // Disconnected: no more updates. Destroyed: the document is gone too.
    let closed = false;
    let destroyed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let comments: LiveCommentChannel | null = null;
    const close = () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      comments?.close();
      if (!closed) {
        closed = true;
        provider.destroy();
      }
      document.destroy();
    };
    // The provider's own retry outlives its destroy, so a fresh one always takes over instead.
    const onLost = () => {
      if (closed) {
        return;
      }
      closed = true;
      lastThreadsRef.current = comments?.getThreads() ?? lastThreadsRef.current;
      comments?.close();
      provider.destroy();
      if (synced) {
        setStatus("offline");
        setSyncing(false);
      }
      const delay = Math.min(
        RECONNECT_DELAY_MS * 2 ** failuresRef.current,
        MAX_RECONNECT_DELAY_MS
      );
      failuresRef.current++;
      retry = setTimeout(() => setAttempt((current) => current + 1), delay);
    };
    const provider = new HocuspocusProvider({
      url,
      name: documentName,
      token: getTicket,
      document,
      onSynced: ({ state }) => {
        if (!state || synced || closed) {
          return;
        }
        synced = true;
        failuresRef.current = 0;
        comments = createLiveCommentChannel(provider, lastThreadsRef.current);
        const next = {
          id: nextConnectionId++,
          document,
          provider,
          comments,
          close,
        };
        shownRef.current = next;
        setConnection(next);
        setStatus("live");
        setSyncing(provider.hasUnsyncedChanges);
      },
      onUnsyncedChanges: ({ number }) => {
        if (synced && !closed) {
          setSyncing(number > 0);
        }
      },
      onDisconnect: onLost,
      // Also sent alone, without a disconnect, when the server closes the document.
      onClose: onLost,
      // A refused or unfetchable ticket: retried with the same backoff, access may come back.
      onAuthenticationFailed: () => {
        setStatus("refused");
        onLost();
      },
    });

    return () => {
      clearTimeout(retry);
      // The shown connection outlives its effect: it closes once replaced, or on unmount.
      if (shownRef.current?.provider !== provider) {
        close();
      }
    };
  }, [url, documentName, userId, getTicket, attempt]);

  // Closed after the swap has rendered, so no editor is left bound to a destroyed document.
  useEffect(() => {
    return () => connection?.close();
  }, [connection]);

  return { connection, status, syncing };
}
