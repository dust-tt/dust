import type {
  DocumentLiveSession,
  LiveStatus,
} from "@app/components/editor/document/types";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";

/** A shared document synced with the server, and the connection that keeps it in sync. */
export interface LiveConnection {
  /** Unique per connection: an editor bound to one never outlives it. */
  id: number;
  document: Y.Doc;
  provider: HocuspocusProvider;
  close: () => void;
}

let nextConnectionId = 0;

/**
 * @cc [owner:PopDaph,label:product] document-live-reconnect
 * A shared document MUST be shown only once it has synced with the server. After a disconnect,
 * its connection MUST NOT reconnect: the server may hold another copy of the document by then,
 * and merging the old one into it would duplicate the content. A fresh document and connection
 * MUST take over, and the old document stays on screen, read-only, until the new one has synced.
 * Joining another document, or as another user, MUST close the current connection at once.
 */
export function useLiveSession(live: DocumentLiveSession | undefined): {
  connection: LiveConnection | null;
  status: LiveStatus;
} {
  const [connection, setConnection] = useState<LiveConnection | null>(null);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [attempt, setAttempt] = useState(0);
  const shownRef = useRef<LiveConnection | null>(null);

  const url = live?.url;
  const documentName = live?.documentName;
  const token = live?.token;

  // Another document or user: what is shown belongs to the previous one.
  useEffect(
    () => () => {
      shownRef.current?.close();
      shownRef.current = null;
      setConnection(null);
      setStatus("connecting");
    },
    [url, documentName, token]
  );

  useEffect(() => {
    if (
      url === undefined ||
      documentName === undefined ||
      token === undefined
    ) {
      return;
    }
    const document = new Y.Doc();
    let synced = false;
    // Disconnected: no more updates. Destroyed: the document is gone too.
    let closed = false;
    let destroyed = false;
    const close = () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      if (!closed) {
        closed = true;
        provider.destroy();
      }
      document.destroy();
    };
    const provider = new HocuspocusProvider({
      url,
      name: documentName,
      token,
      document,
      onSynced: ({ state }) => {
        if (!state || synced || closed) {
          return;
        }
        synced = true;
        const next = { id: nextConnectionId++, document, provider, close };
        shownRef.current = next;
        setConnection(next);
        setStatus("live");
      },
      onDisconnect: () => {
        if (!synced || closed) {
          // Never synced: nothing to merge, the provider keeps retrying on its own.
          return;
        }
        closed = true;
        provider.destroy();
        setStatus("offline");
        setAttempt((current) => current + 1);
      },
      onAuthenticationFailed: () => setStatus("refused"),
    });

    return () => {
      // The shown connection outlives its effect: it closes once replaced, or on unmount.
      if (shownRef.current?.provider !== provider) {
        close();
      }
    };
  }, [url, documentName, token, attempt]);

  // Closed after the swap has rendered, so no editor is left bound to a destroyed document.
  useEffect(() => {
    return () => connection?.close();
  }, [connection]);

  return { connection, status };
}
