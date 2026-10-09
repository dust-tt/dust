import { DocumentView } from "@app/components/editor/document/Document";
import { buildLiveDocumentExtensions } from "@app/components/editor/document/liveExtensions";
import type {
  DocumentLiveSession,
  DocumentProps,
} from "@app/components/editor/document/types";
import { useImageSourceResolver } from "@app/components/editor/document/useImageSourceResolver";
import { useLiveAgentActivity } from "@app/components/editor/document/useLiveAgentActivity";
import { useLiveSession } from "@app/hooks/useLiveSession";
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

interface LiveDocumentProps extends DocumentProps {
  live: DocumentLiveSession;
}

/** A Document in a live session: the file read-only until the shared document has synced. */
export default function LiveDocument(props: LiveDocumentProps) {
  const { t } = useLingui();
  const { connection, status } = useLiveSession(props.live);
  const agent = useLiveAgentActivity(connection?.provider ?? null);
  const { name, color } = props.live.user;
  const resolveImageSource = useImageSourceResolver(props.resolveImageSource);
  const extensions = useMemo(
    () =>
      connection
        ? buildLiveDocumentExtensions({
            t,
            document: connection.document,
            awareness: connection.provider.awareness,
            user: { name, color },
            comments: connection.comments,
            resolveImageSource,
          })
        : null,
    [t, connection, name, color, resolveImageSource]
  );

  return connection && extensions ? (
    // A new connection is a new shared document: the editor binds to it from scratch.
    <DocumentView
      key={connection.id}
      {...props}
      liveView={{
        status,
        agent,
        binding: {
          extensions,
          connected: status === "live",
          comments: connection.comments,
        },
      }}
    />
  ) : (
    <DocumentView {...props} liveView={{ status, binding: null }} />
  );
}
